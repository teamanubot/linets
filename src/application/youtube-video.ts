import type { ChatMessage } from "../domain/chat.ts";
import type { MediaProcessor, ProfileGateway, SquareVideoMode, VideoDownloader } from "../domain/ports.ts";

const VIDEO_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

/** Ambil id video dari link YouTube (watch, youtu.be, shorts, embed, live) dan kembalikan URL baku; null kalau bukan. */
export function parseYoutubeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [, kind, pathId] = url.pathname.split("/");
    id = url.pathname === "/watch" ? url.searchParams.get("v") : kind && ["shorts", "embed", "live", "v"].includes(kind) ? (pathId ?? null) : null;
  }
  return id && VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

/** Hasil rencana kualitas: sisi persegi (piksel) dan batas bitrate video (kbps). */
export interface QualityPlan {
  side: number;
  videoKbps: number;
}

/** Batas upload server LINE ±200 MB (239 MB ditolak 413); pakai batas aman agar tidak gagal diam-diam. */
export const MAX_OUTPUT_BYTES = 180 * 1024 * 1024;
export const AUDIO_KBPS = 128;
const MAX_UPLOAD_LIMIT_BYTES = 195 * 1024 * 1024;

/** Per tingkat: bitrate yang diinginkan dan bitrate minimum supaya kualitasnya masih layak. */
const TIERS = [
  { side: 2160, preferredKbps: 16_000, minKbps: 9_000 },
  { side: 1440, preferredKbps: 9_000, minKbps: 5_000 },
  { side: 1080, preferredKbps: 5_000, minKbps: 2_500 },
  { side: 720, preferredKbps: 2_500, minKbps: 1_200 },
  { side: 480, preferredKbps: 1_200, minKbps: 500 },
] as const;

/**
 * Pilih ukuran terbesar yang muat: ukuran mengikuti kualitas sumber (4K → 2160, 1080p → 1080, ...), tapi turun
 * ke tingkat lebih kecil kalau durasinya membuat bitrate di bawah minimum agar file tetap di bawah batas upload.
 */
export function planVideoQuality(sourceHeight: number, durationSeconds: number): QualityPlan {
  const budgetKbps = Math.floor((MAX_OUTPUT_BYTES * 8) / 1000 / Math.max(1, durationSeconds)) - AUDIO_KBPS;
  const candidates = TIERS.filter((tier) => tier.side <= Math.max(sourceHeight, TIERS[TIERS.length - 1].side));

  for (const tier of candidates) {
    const videoKbps = Math.min(tier.preferredKbps, budgetKbps);
    if (videoKbps >= tier.minKbps) return { side: tier.side, videoKbps };
  }
  return { side: TIERS[TIERS.length - 1].side, videoKbps: Math.max(budgetKbps, 200) };
}

export interface YoutubeVideoDeps {
  downloader: VideoDownloader;
  profile: ProfileGateway;
  media: MediaProcessor;
  /** Batas durasi video, default 10 menit. */
  maxDurationSeconds?: number;
}

const DEFAULT_MAX_DURATION_SECONDS = 600;

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** `tab vpl <link youtube> [foto] [potong]`: unduh video YouTube (dengan suara), jadikan video profil, lalu hapus file sementara. */
export class YoutubeVideo {
  private busy = false;
  private readonly maxDurationSeconds: number;

  constructor(private readonly deps: YoutubeVideoDeps) {
    this.maxDurationSeconds = deps.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  }

  async setAsProfileVideo(args: string, message: ChatMessage): Promise<void> {
    const [link = "", ...options] = args.trim().split(/\s+/);
    const url = parseYoutubeUrl(link);
    if (!url) {
      return message.reply(
        "Pakai: tab vpl <link YouTube> [foto] [potong]\n" +
          "• foto → sekalian jadikan foto profil\n" +
          "• potong → potong tengah jadi persegi (default: seluruh gambar dimuat, tidak terpotong)",
      );
    }
    const flags = new Set(options.map((option) => option.toLowerCase()));
    if (this.busy) return message.reply("Masih memproses video sebelumnya, tunggu sampai selesai.");

    this.busy = true;
    try {
      await this.process(url, { withPhoto: flags.has("foto"), mode: flags.has("potong") ? "crop" : "fit" }, message);
    } finally {
      this.busy = false;
    }
  }

  private async process(url: string, { withPhoto, mode }: { withPhoto: boolean; mode: SquareVideoMode }, message: ChatMessage): Promise<void> {
    const { downloader, profile, media } = this.deps;

    const { title, durationSeconds, maxHeight } = await downloader.info(url);
    if (durationSeconds > this.maxDurationSeconds) {
      return message.reply(
        `Video terlalu panjang (${formatClock(durationSeconds)}). Maksimal ${formatClock(this.maxDurationSeconds)}.`,
      );
    }

    const plan = planVideoQuality(maxHeight, durationSeconds);
    await message.reply(
      `⏳ Mengunduh "${title}" (${formatClock(durationSeconds)}), kualitas sumber ${maxHeight}p.\n` +
        `Hasil: persegi ${plan.side}×${plan.side}${plan.side < Math.min(maxHeight, 2160) ? " (diturunkan agar muat di batas upload LINE)" : ""}.`,
    );

    const source = await downloader.download(url, maxHeight);
    let video: Buffer;
    try {
      await message.reply(`🎞️ Memproses video jadi persegi${mode === "crop" ? " (dipotong tengah)" : " (seluruh gambar dimuat)"}, suara dipertahankan. Ini bisa memakan waktu...`);
      video = await media.toSquareVideo(source.path, { mode, ...plan });
    } finally {
      await source.dispose();
    }
    if (video.length > MAX_UPLOAD_LIMIT_BYTES) {
      throw new Error(`Hasil ${(video.length / 1024 / 1024).toFixed(0)} MB melebihi batas upload LINE (±200 MB).`);
    }

    if (withPhoto) await profile.setVideo(video, await media.extractFrame(video, "square"));
    else await profile.setVideoKeepImage(video);

    await message.reply(
      `✅ Berhasil: video profil sudah diganti dengan "${title}" (${plan.side}×${plan.side}, ${(video.length / 1024 / 1024).toFixed(1)} MB, dengan suara), ` +
        `${withPhoto ? "foto profil diambil dari video" : "foto profil tidak diubah"}. File sementara sudah dihapus.`,
    );
  }
}
