import type { ChatMessage, FileInfo, LocationInfo, MediaKind, StickerInfo } from "../domain/chat.ts";
import { DEFAULT_SETTINGS, type BotSettings, type CachedMedia, type ChatSender, type MediaProcessor, type MediaSender, type PeopleDirectory, type SettingsStore, type UnsendMediaCache } from "../domain/ports.ts";

interface Remembered {
  senderId: string;
  chatId: string;
  text: string;
  mediaKind: MediaKind | null;
  sticker: StickerInfo | null;
  location: LocationInfo | null;
  file: FileInfo | null;
}

export interface AntiUnsendDeps {
  store: SettingsStore;
  /** Kirim teks laporan ke chat tempat pesannya ditarik (grup atau pribadi). */
  chatSender: ChatSender;
  /** Kirim ulang gambar/video/file yang berhasil dicache sebelum ditarik. */
  mediaSender: MediaSender;
  /** Simpan sementara gambar/video/file (begitu ditarik, LINE langsung menolak unduh ulang isinya). */
  mediaCache: UnsendMediaCache;
  /** Untuk membaca durasi video yang dikirim ulang. */
  media: MediaProcessor;
  people: PeopleDirectory;
  /** Catat juga pesan dari akun sendiri (untuk uji); default hanya pesan orang lain. */
  trackOwnMessages?: boolean;
  capacity?: number;
}

const DEFAULT_CAPACITY = 500;
const MEDIA_LABEL: Record<MediaKind, string> = { image: "[gambar]", video: "[video]" };
/** Jenis yang dicache proaktif (kalau-kalau ditarik); sticker/lokasi tidak perlu karena detailnya sudah ada di pesan itu sendiri. */
const CACHEABLE_KINDS = new Set<CachedMedia["kind"]>(["image", "video", "file"]);

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Isi pesan yang ditarik, sebelum tahu apakah media-nya berhasil dicache. */
function describe(remembered: Remembered): string {
  if (remembered.text) return remembered.text;
  if (remembered.sticker) return `[sticker] id ${remembered.sticker.stickerId} (paket ${remembered.sticker.packageId})`;
  if (remembered.location) {
    const { title, address, latitude, longitude } = remembered.location;
    return `[lokasi] ${title || "(tanpa judul)"}${address ? ` — ${address}` : ""} (${latitude}, ${longitude})`;
  }
  if (remembered.file) return `[file] ${remembered.file.name} (${formatBytes(remembered.file.size)})`;
  if (remembered.mediaKind) return MEDIA_LABEL[remembered.mediaKind];
  return "(pesan non-teks)";
}

/** Kirim ulang isi pesan yang ditarik (termasuk gambar/video/file kalau berhasil dicache) ke chat tempat kejadiannya. */
export class AntiUnsend {
  private settings: BotSettings = structuredClone(DEFAULT_SETTINGS);
  private readonly messages = new Map<string, Remembered>();
  private readonly capacity: number;

  constructor(private readonly deps: AntiUnsendDeps) {
    this.capacity = deps.capacity ?? DEFAULT_CAPACITY;
  }

  async init(): Promise<void> {
    this.settings = await this.deps.store.load();
  }

  /** Chat yang belum pernah diatur dianggap MATI (bawaan), bukan global — tiap grup/pribadi diatur sendiri-sendiri. */
  isEnabled(chatId: string): boolean {
    return this.settings.antiUnsend.chats[chatId] ?? false;
  }

  /** Perintah `tab antiunsend [on | off]`; mengatur chat ini saja (grup/pribadi tempat perintah ini diketik), bukan semua chat. */
  async configure(args: string, message: ChatMessage): Promise<void> {
    const choice = args.toLowerCase();
    if (choice !== "on" && choice !== "off") {
      return message.reply(`Anti-unsend di chat ini: ${this.isEnabled(message.chatId) ? "AKTIF" : "MATI"}. Pakai: tab antiunsend on / off`);
    }
    this.settings = { ...this.settings, antiUnsend: { chats: { ...this.settings.antiUnsend.chats, [message.chatId]: choice === "on" } } };
    await this.deps.store.save(this.settings);
    await message.reply(choice === "on" ? "✅ Anti-unsend diaktifkan di chat ini." : "Anti-unsend dimatikan di chat ini.");
  }

  remember(message: ChatMessage): void {
    if (message.isFromSelf && !this.deps.trackOwnMessages) return;

    this.messages.delete(message.id);
    this.messages.set(message.id, {
      senderId: message.senderId,
      chatId: message.chatId,
      text: message.text,
      mediaKind: message.mediaKind,
      sticker: message.sticker,
      location: message.location,
      file: message.file,
    });
    if (this.messages.size > this.capacity) {
      const oldest = this.messages.keys().next().value;
      if (oldest !== undefined) this.messages.delete(oldest);
    }

    // Hanya di-cache untuk chat yang aktif anti-unsend-nya — bukan universal — supaya tidak ada unduhan
    // sia-sia untuk chat yang justru dimatikan. Begitu pesan ditarik, LINE langsung menolak unduh ulang
    // isinya (HTTP 410), jadi harus dicache sekarang, tidak menunggu/menghalangi pemrosesan pesan lain.
    if (this.isEnabled(message.chatId)) this.cacheMedia(message).catch(() => {});
  }

  private async cacheMedia(message: ChatMessage): Promise<void> {
    const kind: CachedMedia["kind"] | null = message.mediaKind === "image" ? "image" : message.mediaKind === "video" ? "video" : message.file ? "file" : null;
    if (!kind || !CACHEABLE_KINDS.has(kind)) return;

    const data = await message.downloadMedia();
    await this.deps.mediaCache.put(message.id, { kind, data, filename: message.file?.name });
  }

  /** Mengembalikan true kalau laporannya terkirim. */
  async onUnsent(messageId: string): Promise<boolean> {
    const remembered = this.messages.get(messageId);
    if (!remembered) return false;
    this.messages.delete(messageId);
    if (!this.isEnabled(remembered.chatId)) return false;

    const sender = await this.deps.people.displayName(remembered.senderId);
    const cached = await this.deps.mediaCache.take(messageId);
    const note = cached ? " (dikirim ulang di bawah)" : remembered.mediaKind || remembered.file ? " (sudah tidak bisa diambil ulang)" : "";
    await this.deps.chatSender.sendText(remembered.chatId, `🗑️ Pesan ditarik\nDari: ${sender}\nIsi: ${describe(remembered)}${note}`);

    if (cached) await this.resend(remembered.chatId, cached);
    return true;
  }

  private async resend(chatId: string, cached: CachedMedia): Promise<void> {
    const { mediaSender, media } = this.deps;
    if (cached.kind === "image") await mediaSender.sendImage(chatId, cached.data);
    else if (cached.kind === "video") await mediaSender.sendVideo(chatId, cached.data, await media.videoDurationMs(cached.data));
    else await mediaSender.sendFile(chatId, cached.data, cached.filename || "file");
  }
}
