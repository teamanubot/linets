import { readFile } from "node:fs/promises";
import type { ChatMessage } from "../domain/chat.ts";
import type { FetchedMediaItem, MediaFetcher, MediaProcessor, MediaSender } from "../domain/ports.ts";

export type DownloadPlatform = "instagram" | "twitter" | "facebook" | "tiktok" | "youtube";

interface PlatformInfo {
  key: DownloadPlatform;
  name: string;
  /** Nama perintah unduh khusus platform ini, mis. "dl-ig". */
  command: string;
}

const PLATFORMS: Record<DownloadPlatform, PlatformInfo> = {
  instagram: { key: "instagram", name: "Instagram", command: "dl-ig" },
  twitter: { key: "twitter", name: "Twitter/X", command: "dl-twitter" },
  facebook: { key: "facebook", name: "Facebook", command: "dl-facebook" },
  tiktok: { key: "tiktok", name: "TikTok", command: "dl-tiktok" },
  youtube: { key: "youtube", name: "YouTube", command: "dl-yt" },
};

/** Domain yang didukung, dipetakan ke platform-nya. */
const PLATFORM_HOSTS: Record<string, DownloadPlatform> = {
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "twitter.com": "twitter",
  "www.twitter.com": "twitter",
  "mobile.twitter.com": "twitter",
  "x.com": "twitter",
  "www.x.com": "twitter",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "web.facebook.com": "facebook",
  "fb.watch": "facebook",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "m.tiktok.com": "tiktok",
  "vm.tiktok.com": "tiktok",
  "vt.tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "music.youtube.com": "youtube",
  "youtu.be": "youtube",
};

/** Info platform kalau link didukung (Instagram/Twitter(X)/Facebook/TikTok/YouTube); null kalau bukan/tidak valid. */
export function detectDownloadPlatform(input: string): PlatformInfo | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const key = PLATFORM_HOSTS[url.hostname.toLowerCase()];
    return key ? PLATFORMS[key] : null;
  } catch {
    return null;
  }
}

/** Batas upload server LINE ±200 MB (239 MB ditolak 413); pakai batas aman agar tidak gagal diam-diam. */
const MAX_UPLOAD_BYTES = 195 * 1024 * 1024;

export interface MediaDownloaderDeps {
  fetcher: MediaFetcher;
  sender: MediaSender;
  media: MediaProcessor;
}

/**
 * `tab dl-ig|dl-tiktok|dl-facebook|dl-twitter|dl-yt <link>` dan `tab dl-ytmp3 <link>`: unduh lalu kirim ke chat
 * ini. Tiap perintah hanya menerima link dari platform yang sesuai namanya. Jenis medianya (video dengan suara,
 * atau foto/thumbnail, atau campuran keduanya untuk postingan karusel) dideteksi otomatis dari postingannya
 * sendiri — tidak ada opsi mp3/foto manual, kecuali dl-ytmp3 yang selalu memaksa audio mp3.
 */
export class MediaDownloader {
  private busy = false;

  constructor(private readonly deps: MediaDownloaderDeps) {}

  /** `expect`: perintah ini hanya untuk platform itu. `forceAudio`: selalu ekstrak audio mp3 (dipakai oleh dl-ytmp3). */
  async run(args: string, message: ChatMessage, expect: DownloadPlatform, forceAudio = false): Promise<void> {
    const [link = ""] = args.trim().split(/\s+/);
    const expected = PLATFORMS[expect];
    const detected = detectDownloadPlatform(link);

    if (!detected) {
      return message.reply(
        `Pakai: tab ${expected.command} <link ${expected.name}>\n` +
          (forceAudio ? "Hasilnya selalu audio mp3 kualitas terbaik." : "Video atau foto diambil otomatis sesuai isi postingannya, kualitas terbaik."),
      );
    }
    if (detected.key !== expect) {
      return message.reply(`Link itu dari ${detected.name}, bukan ${expected.name}. Pakai tab ${detected.command} untuk link ini.`);
    }
    if (this.busy) return message.reply("Masih memproses unduhan sebelumnya, tunggu sampai selesai.");

    this.busy = true;
    try {
      await this.process(link, expected.name, forceAudio, message);
    } finally {
      this.busy = false;
    }
  }

  private async process(url: string, platformName: string, forceAudio: boolean, message: ChatMessage): Promise<void> {
    const { fetcher, sender, media } = this.deps;
    await message.reply(
      forceAudio
        ? `⏳ Mengunduh audio (mp3) dari ${platformName}, kualitas terbaik...`
        : `⏳ Mengunduh dari ${platformName} (video atau foto sesuai postingannya), kualitas terbaik...`,
    );

    const result = await fetcher.fetch(url, forceAudio);
    try {
      let videos = 0;
      let photos = 0;
      let totalBytes = 0;

      for (const item of result.items) {
        const buffer = await readFile(item.path);
        if (buffer.length > MAX_UPLOAD_BYTES) {
          throw new Error(`Salah satu hasil ${(buffer.length / 1024 / 1024).toFixed(0)} MB melebihi batas upload LINE (±200 MB).`);
        }
        totalBytes += buffer.length;
        await this.send(item, buffer, message.chatId);
        if (item.kind === "video") videos++;
        else if (item.kind === "image") photos++;
      }

      await message.reply(`✅ Berhasil: "${result.title}" (${this.summary(result.items.length, videos, photos)}, ${(totalBytes / 1024 / 1024).toFixed(1)} MB). File sementara sudah dihapus.`);
    } finally {
      await result.dispose();
    }
  }

  private async send(item: FetchedMediaItem, buffer: Buffer, chatId: string): Promise<void> {
    const { sender, media } = this.deps;
    if (item.kind === "image") return sender.sendImage(chatId, buffer);

    const durationMs = await media.videoDurationMs(buffer);
    if (item.kind === "audio") return sender.sendAudio(chatId, buffer, durationMs);
    return sender.sendVideo(chatId, buffer, durationMs);
  }

  private summary(total: number, videos: number, photos: number): string {
    if (total <= 1) return videos > 0 ? "video" : photos > 0 ? "foto" : "audio";
    const parts = [videos > 0 ? `${videos} video` : "", photos > 0 ? `${photos} foto` : ""].filter(Boolean);
    return `${total} item: ${parts.join(" + ")}`;
  }
}
