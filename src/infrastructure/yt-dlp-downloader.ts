import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { DownloadedVideo, FetchedMedia, FetchedMediaItem, MediaFetcher, SearchProvider, SearchResultItem, VideoDownloader, VideoInfo } from "../domain/ports.ts";

const run = promisify(execFile);

// youtube-dl-exec mengunduh binary yt-dlp saat `npm install`; ambil lokasinya dari paketnya.
const { constants } = createRequire(import.meta.url)("youtube-dl-exec") as { constants: { YOUTUBE_DL_PATH: string } };
const YT_DLP = constants.YOUTUBE_DL_PATH;

const INFO_TIMEOUT_MS = 2 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 20 * 60_000;
/** Batas file mentah (4K berdurasi 10 menit bisa lebih dari 2 GB). */
const MAX_SOURCE_SIZE = "3G";
const MAX_QUALITY_HEIGHT = 2160;

/** Ambil baris "ERROR: ..." terakhir dari keluaran yt-dlp supaya pesan ke pengguna singkat. */
function describeFailure(error: unknown): Error {
  const stderr = String((error as { stderr?: string }).stderr ?? "");
  const line = stderr.split("\n").reverse().find((candidate) => candidate.includes("ERROR:"));
  if (line) return new Error(line.replace(/^.*ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?/, "").trim());
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Error("yt-dlp tidak ditemukan. Jalankan npm install lagi.");
  if ((error as { killed?: boolean }).killed) return new Error("Pengunduhan melebihi batas waktu.");
  return new Error("yt-dlp gagal dijalankan (butuh Python 3.9+).");
}

/** Error yang sudah kita susun sendiri diteruskan apa adanya; selebihnya (hasil execFile) diringkas. */
const asFriendlyError = (error: unknown) => (error instanceof Error && !("stderr" in error) ? error : describeFailure(error));

const TEMP_PREFIX = "linebot-yt-";

/** Hapus folder unduhan sementara yang tertinggal (bot dimatikan saat mengunduh). Mengembalikan jumlah yang dihapus. */
export async function removeStaleDownloads(maxAgeMs = 60 * 60_000): Promise<number> {
  let removed = 0;
  for (const name of await readdir(tmpdir())) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const path = join(tmpdir(), name);
    try {
      if (Date.now() - (await stat(path)).mtimeMs > maxAgeMs) {
        await rm(path, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // folder hilang atau tidak bisa diakses; lewati
    }
  }
  return removed;
}

export class YtDlpDownloader implements VideoDownloader {
  async info(url: string): Promise<VideoInfo> {
    try {
      const { stdout } = await run(YT_DLP, ["--no-playlist", "--no-warnings", "--skip-download", "--dump-single-json", url], {
        timeout: INFO_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024,
      });
      const data = JSON.parse(stdout) as {
        title?: string;
        duration?: number | null;
        is_live?: boolean;
        formats?: Array<{ height?: number | null; vcodec?: string | null }>;
      };
      if (data.is_live || typeof data.duration !== "number") throw new Error("Video live/tanpa durasi tidak didukung.");

      const heights = (data.formats ?? [])
        .filter((format) => format.vcodec && format.vcodec !== "none" && typeof format.height === "number")
        .map((format) => format.height as number)
        .filter((height) => height <= MAX_QUALITY_HEIGHT);
      return { title: data.title ?? "(tanpa judul)", durationSeconds: data.duration, maxHeight: Math.max(0, ...heights) || 360 };
    } catch (error) {
      throw asFriendlyError(error);
    }
  }

  async download(url: string, maxHeight: number): Promise<DownloadedVideo> {
    const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    const dispose = () => rm(directory, { recursive: true, force: true });
    try {
      await run(
        YT_DLP,
        [
          "--no-playlist", "--no-warnings", "--no-progress",
          // Kualitas terbaik sampai maxHeight (codec apa pun: 4K di YouTube umumnya VP9/AV1) + audio terbaik.
          "-f", `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]`,
          // MKV menampung codec apa pun; dikonversi ke MP4 H.264 sesudahnya.
          "--merge-output-format", "mkv",
          "--max-filesize", MAX_SOURCE_SIZE,
          "--ffmpeg-location", dirname(ffmpegInstaller.path),
          "-o", join(directory, "source.%(ext)s"),
          url,
        ],
        { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
      );
      const file = (await readdir(directory)).find((name) => name.startsWith("source.") && !name.endsWith(".part"));
      if (!file) throw new Error(`Video tidak bisa diunduh (mungkin lebih dari ${MAX_SOURCE_SIZE.replace("G", " GB")}).`);
      return { path: join(directory, file), dispose };
    } catch (error) {
      await dispose();
      throw asFriendlyError(error);
    }
  }
}

interface RawEntry {
  duration?: number | null;
  formats?: Array<{ vcodec?: string | null }>;
}

interface RawInfo extends RawEntry {
  title?: string;
  is_live?: boolean;
  entries?: Array<RawEntry | null>;
}

/** Postingan ini punya jalur video (bukan cuma foto/thumbnail): durasi beneran atau ada format dengan vcodec asli. */
function hasVideoFormat(entry: RawEntry): boolean {
  if (typeof entry.duration === "number" && entry.duration > 0) return true;
  return (entry.formats ?? []).some((format) => format.vcodec && format.vcodec !== "none");
}

/**
 * Tanpa flag ini, yt-dlp melempar error "No video formats found!" untuk slide karusel yang isinya foto
 * (bukan video) sewaktu mengambil info, padahal itu memang foto, bukan gagal unduh. Dipakai di semua
 * pemanggilan yt-dlp di kelas ini supaya aman walau belum tahu jenis isinya.
 */
const IGNORE_NO_FORMATS = "--ignore-no-formats-error";

/** Maks. jumlah slide yang diunduh dari satu postingan karusel (foto+video gabungan), agar tidak kebablasan. */
const MAX_CAROUSEL_ITEMS = 10;

const findItemFile = async (directory: string, prefix: string) =>
  (await readdir(directory)).find((name) => name.startsWith(prefix) && !name.endsWith(".part"));

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function downloadImages(urls: string[], directory: string): Promise<FetchedMediaItem[]> {
  const items: FetchedMediaItem[] = [];
  for (const [i, url] of urls.entries()) {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) continue;
    const path = join(directory, `item${i}.jpg`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
    items.push({ path, kind: "image" });
  }
  return items;
}

/**
 * yt-dlp tidak mendukung tweet yang isinya foto saja sama sekali (hanya video, lihat extractor twitter.py-nya).
 * Fallback ini pakai endpoint publik syndication Twitter (dipakai juga oleh widget embed resmi, tanpa login)
 * untuk ambil foto aslinya langsung, kualitas penuh (`?name=orig`). Hanya dipakai kalau yt-dlp tidak dapat apa-apa.
 */
async function fetchTwitterPhotos(url: string, directory: string): Promise<FetchedMediaItem[]> {
  const id = /status\/(\d+)/.exec(url)?.[1];
  if (!id) return [];

  const infoRes = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=1`, { headers: { "User-Agent": BROWSER_UA } });
  if (!infoRes.ok) return [];
  const data = (await infoRes.json()) as { mediaDetails?: Array<{ type?: string; media_url_https?: string }> };
  const photoUrls = (data.mediaDetails ?? []).filter((m) => m.type === "photo" && m.media_url_https).map((m) => `${m.media_url_https}?format=jpg&name=orig`);
  return downloadImages(photoUrls, directory);
}

/** Cari semua nilai dari objek bersarang (hasil parse JSON) yang key-nya cocok, tanpa tergantung bentuk/path pastinya. */
function findAllByKey(obj: unknown, key: string): unknown[] {
  if (!obj || typeof obj !== "object") return [];
  const results: unknown[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === key) results.push(v);
    results.push(...findAllByKey(v, key));
  }
  return results;
}

/** Thumbnail YouTube (yt3.ggpht.com/...) diberi suffix `=sNNN-...`; ganti jadi `=s0` untuk resolusi aslinya. */
function originalQuality(thumbnailUrl: string): string {
  return thumbnailUrl.replace(/=s\d+(?:-[\w-]+)?$/, "=s0");
}

/** youtube.com/post/<id>, bentuk URL khusus Community post (tidak didukung yt-dlp sama sekali). */
function isYoutubeCommunityPost(url: string): boolean {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return /(?:^|\.)youtube\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith("/post/");
  } catch {
    return false;
  }
}

/**
 * YouTube Community post (youtube.com/post/<id>) tidak punya extractor di yt-dlp sama sekali (dicoba sebagai
 * channel tab dan selalu gagal). Fallback ini membaca `ytInitialData` yang disisipkan langsung di HTML
 * halamannya (tanpa login) untuk menemukan gambar postingannya, lalu ambil versi resolusi aslinya.
 */
async function fetchYoutubeCommunityPost(url: string, directory: string): Promise<{ title: string; items: FetchedMediaItem[] }> {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) return { title: "", items: [] };
  const html = await res.text();
  const match = /ytInitialData"?\]?\s*=\s*(\{.+?\});/s.exec(html);
  if (!match) return { title: "", items: [] };

  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return { title: "", items: [] };
  }

  const imageUrls: string[] = [];
  for (const renderer of findAllByKey(data, "backstageImageRenderer")) {
    const thumbnails = (renderer as { image?: { thumbnails?: Array<{ url?: string }> } })?.image?.thumbnails;
    const best = thumbnails?.at(-1)?.url;
    if (best) imageUrls.push(originalQuality(best));
  }

  const textRuns = findAllByKey(data, "contentText")[0] as { runs?: Array<{ text?: string }> } | undefined;
  const title = (textRuns?.runs ?? []).map((run) => run.text ?? "").join("").trim();

  return { title: title || "(tanpa judul)", items: await downloadImages(imageUrls, directory) };
}

/**
 * Unduh media dari Instagram/Twitter(X)/Facebook/TikTok/YouTube lewat yt-dlp (mendukung semuanya lewat satu
 * extractor generik), kualitas terbaik yang tersedia. Jenisnya (video dengan suara, atau foto/thumbnail)
 * dideteksi otomatis dari postingannya sendiri; postingan karusel (campuran foto & video) diunduh semuanya,
 * urut sesuai slide-nya. `forceAudio`: lewati deteksi, selalu ekstrak audio mp3 (khusus dl-ytmp3).
 */
export class YtDlpMediaFetcher implements MediaFetcher {
  async fetch(url: string, forceAudio = false): Promise<FetchedMedia> {
    const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    const dispose = () => rm(directory, { recursive: true, force: true });
    const ffmpegDir = dirname(ffmpegInstaller.path);

    // yt-dlp tidak punya extractor sama sekali untuk Community post YouTube; tidak ada gunanya mencobanya dulu.
    if (!forceAudio && isYoutubeCommunityPost(url)) {
      try {
        const { title, items } = await fetchYoutubeCommunityPost(url, directory);
        if (items.length === 0) throw new Error("Tidak ada gambar yang bisa diambil dari postingan ini.");
        return { title, items, dispose };
      } catch (error) {
        await dispose();
        throw asFriendlyError(error);
      }
    }

    try {
      const { stdout } = await run(YT_DLP, ["--yes-playlist", "--no-warnings", IGNORE_NO_FORMATS, "--skip-download", "--dump-single-json", url], {
        timeout: INFO_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024,
      });
      const data = JSON.parse(stdout) as RawInfo;
      if (data.is_live) throw new Error("Siaran langsung tidak didukung.");
      const title = data.title?.trim() || "(tanpa judul)";

      if (forceAudio) {
        await run(
          YT_DLP,
          [
            "--no-playlist", "--no-warnings", IGNORE_NO_FORMATS, "--no-progress",
            "-x", "--audio-format", "mp3", "--audio-quality", "0", // VBR terbaik yang tersedia dari sumbernya.
            "--ffmpeg-location", ffmpegDir, "--max-filesize", MAX_SOURCE_SIZE,
            "-o", join(directory, "item0.%(ext)s"),
            url,
          ],
          { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
        );
        const file = await findItemFile(directory, "item0.");
        if (!file) throw new Error("Audio tidak bisa diunduh.");
        return { title, items: [{ path: join(directory, file), kind: "audio" }], dispose };
      }

      const isPlaylist = Array.isArray(data.entries);
      const rawEntries = isPlaylist ? data.entries!.slice(0, MAX_CAROUSEL_ITEMS) : [data];
      // originalIndex (posisi asli, dipakai untuk --playlist-items) dijaga tetap walau ada slide null yang dilewati.
      const entries = rawEntries
        .map((entry, originalIndex) => ({ entry, originalIndex }))
        .filter((e): e is { entry: RawEntry; originalIndex: number } => e.entry !== null);
      const items: FetchedMediaItem[] = [];

      for (const [itemIndex, { entry, originalIndex }] of entries.entries()) {
        const isVideo = hasVideoFormat(entry);
        const base = join(directory, `item${itemIndex}`);
        const common = [
          "--no-warnings", IGNORE_NO_FORMATS, "--no-progress",
          "--ffmpeg-location", ffmpegDir,
          "--max-filesize", MAX_SOURCE_SIZE,
          "-o", `${base}.%(ext)s`,
          ...(isPlaylist ? ["--yes-playlist", "--playlist-items", String(originalIndex + 1)] : ["--no-playlist"]),
          url,
        ];
        if (isVideo) {
          // Prioritaskan mp4/h264+m4a asli (IG/TikTok/FB/Twitter/YouTube ≤1080p) sebelum merge umum ke mp4.
          await run(YT_DLP, ["-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b", "--merge-output-format", "mp4", ...common], {
            timeout: DOWNLOAD_TIMEOUT_MS,
            maxBuffer: 50 * 1024 * 1024,
          });
        } else {
          await run(YT_DLP, ["--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg", ...common], {
            timeout: DOWNLOAD_TIMEOUT_MS,
            maxBuffer: 50 * 1024 * 1024,
          });
        }
        const file = await findItemFile(directory, `item${itemIndex}.`);
        if (file) items.push({ path: join(directory, file), kind: isVideo ? "video" : "image" });
      }

      const isTwitter = /(?:^|\.)(?:twitter\.com|x\.com)$/i.test(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname);
      if (items.length === 0 && isTwitter) {
        items.push(...(await fetchTwitterPhotos(url, directory)));
      }
      if (items.length === 0) throw new Error(`Tidak ada media yang bisa diunduh dari link ini (mungkin lebih dari ${MAX_SOURCE_SIZE.replace("G", " GB")}).`);
      return { title, items, dispose };
    } catch (error) {
      await dispose();
      throw asFriendlyError(error);
    }
  }
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const MAX_SEARCH_RESULTS = 50;

/** Pencarian YouTube resmi (fitur bawaan yt-dlp lewat "ytsearchN:<kata kunci>"), tidak perlu login. */
export class YtDlpSearchProvider implements SearchProvider {
  async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const n = Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_RESULTS);
    try {
      const { stdout } = await run(YT_DLP, ["--flat-playlist", "--no-warnings", "--dump-single-json", `ytsearch${n}:${query}`], {
        timeout: INFO_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024,
      });
      const data = JSON.parse(stdout) as {
        entries?: Array<{ id?: string; title?: string; url?: string; uploader?: string; channel?: string; duration?: number | null }>;
      };
      return (data.entries ?? []).map((entry) => ({
        title: entry.title?.trim() || "(tanpa judul)",
        author: entry.uploader ?? entry.channel ?? undefined,
        link: entry.url && /^https?:\/\//.test(entry.url) ? entry.url : `https://www.youtube.com/watch?v=${entry.id}`,
        extra: typeof entry.duration === "number" ? formatSeconds(entry.duration) : undefined,
      }));
    } catch (error) {
      throw asFriendlyError(error);
    }
  }
}
