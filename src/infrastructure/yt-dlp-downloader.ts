import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { DownloadedVideo, VideoDownloader, VideoInfo } from "../domain/ports.ts";

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
