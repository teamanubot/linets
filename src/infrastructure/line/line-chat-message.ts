import type { TalkMessage } from "@tab/linets";
import type { ChatMessage, FileInfo, LocationInfo, MediaKind, StickerInfo } from "../../domain/chat.ts";
import type { LineMessageResolver } from "./line-message-resolver.ts";

const DOWNLOAD_ATTEMPTS = 30;
const DOWNLOAD_RETRY_MS = 1500;
// Beri waktu kunci E2EE baru dipakai di sisi server/perangkat lain sebelum kirim ulang, supaya pesan
// yang dikirim segera setelah kunci didaftarkan ulang tidak muncul "tidak dapat ditampilkan" di penerima.
const GROUP_KEY_PROPAGATION_DELAY_MS = 1000;

function requiresE2ee(error: unknown): boolean {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return code === "E2EE_RETRY_ENCRYPT" || String(error).includes("E2EE_RETRY_ENCRYPT");
}

/**
 * Terjadi setelah keanggotaan grup berubah banyak sekaligus (mis. `tab kickall`): kunci E2EE grup lama
 * tidak cocok lagi dengan anggota yang tersisa, sampai didaftarkan ulang lewat `tryRegisterE2EEGroupKey`.
 */
function needsGroupKeyRecreate(error: unknown): boolean {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return code === "E2EE_RECREATE_GROUP_KEY" || String(error).includes("E2EE_RECREATE_GROUP_KEY");
}

/** Membungkus TalkMessage dari LINEJS sebagai ChatMessage. */
export class LineChatMessage implements ChatMessage {
  constructor(
    private readonly message: TalkMessage,
    private readonly resolver: LineMessageResolver,
    private readonly groupKeyPropagationDelayMs = GROUP_KEY_PROPAGATION_DELAY_MS,
  ) {}

  get id(): string {
    return this.message.raw.id;
  }

  get senderId(): string {
    return this.message.from.id;
  }

  get text(): string {
    return this.message.text ?? "";
  }

  get isFromSelf(): boolean {
    return this.message.isMyMessage;
  }

  get mediaKind(): MediaKind | null {
    const type = this.message.raw.contentType;
    if (type === 1 || type === "IMAGE") return "image";
    if (type === 2 || type === "VIDEO") return "video";
    return null;
  }

  get sticker(): StickerInfo | null {
    if (this.message.raw.contentType !== 7 && this.message.raw.contentType !== "STICKER") return null;
    const metadata = this.message.raw.contentMetadata as Record<string, string> | undefined;
    const packageId = metadata?.STKPKGID;
    const stickerId = metadata?.STKID;
    return packageId && stickerId ? { packageId, stickerId } : null;
  }

  get location(): LocationInfo | null {
    const location = this.message.raw.location;
    if (!location) return null;
    return { title: location.title ?? "", address: location.address ?? "", latitude: location.latitude, longitude: location.longitude };
  }

  get file(): FileInfo | null {
    if (this.message.raw.contentType !== 14 && this.message.raw.contentType !== "FILE") return null;
    const metadata = this.message.raw.contentMetadata as Record<string, string> | undefined;
    const name = metadata?.FILE_NAME;
    if (!name) return null;
    return { name, size: Number(metadata?.FILE_SIZE ?? 0) };
  }

  get chatId(): string {
    return this.message.to.id;
  }

  get isGroupChat(): boolean {
    return this.message.to.type === "GROUP" || this.message.to.type === 2;
  }

  get mentionedIds(): string[] {
    return this.message.getMentions().flatMap((target) => (target.all ? [] : [target.mid]));
  }

  async repliedMessage(): Promise<ChatMessage | null> {
    const target = this.message.getReplyTarget();
    if (!target) return null;
    const resolved = await this.resolver.resolve(target.id, this.chatId);
    return resolved ? new LineChatMessage(resolved, this.resolver, this.groupKeyPropagationDelayMs) : null;
  }

  /**
   * LINEJS membalas dengan E2EE hanya kalau pesan aslinya terenkripsi. Pesan media tidak, padahal
   * server menuntut E2EE di chat itu (E2EE_RETRY_ENCRYPT), jadi ulangi dengan E2EE kalau ditolak.
   */
  async reply(text: string): Promise<void> {
    try {
      await this.message.reply(text);
    } catch (error) {
      if (needsGroupKeyRecreate(error)) {
        await this.resolver.getClient().base.e2ee.tryRegisterE2EEGroupKey(this.chatId);
        // Kirim ulang dengan cara yang sama seperti semula (bukan memaksa e2ee:true) — memaksa E2EE di sini
        // pernah membuat pesannya muncul "tidak dapat ditampilkan" di penerima, mungkin karena kunci yang
        // baru didaftarkan belum sempat dipakai semua perangkat/sesi. Jeda sebentar dulu sebelum kirim ulang.
        await new Promise((resolve) => setTimeout(resolve, this.groupKeyPropagationDelayMs));
        return void (await this.message.reply(text));
      }
      if (!requiresE2ee(error)) throw error;
      await this.message.reply({ text, e2ee: true });
    }
  }

  /**
   * Server LINE masih memproses video yang baru dikirim: `getData()` mengembalikan 0 byte sampai media
   * siap (beberapa detik). Jadi ulangi sampai ada isinya.
   */
  async downloadMedia(): Promise<Buffer> {
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
      try {
        const data = Buffer.from(await (await this.message.getData()).arrayBuffer());
        if (data.length > 0) return data;
      } catch {
        // belum siap; coba lagi
      }
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_RETRY_MS));
    }
    throw new Error("Media belum siap diunduh dari server LINE. Coba kirim ulang.");
  }

  async markAsRead(): Promise<void> {
    await this.message.read();
  }
}
