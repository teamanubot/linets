import type { TalkMessage } from "@tab/linets";
import type { ChatMessage, MediaKind } from "../../domain/chat.ts";
import type { LineMessageResolver } from "./line-message-resolver.ts";

const DOWNLOAD_ATTEMPTS = 30;
const DOWNLOAD_RETRY_MS = 1500;

function requiresE2ee(error: unknown): boolean {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return code === "E2EE_RETRY_ENCRYPT" || String(error).includes("E2EE_RETRY_ENCRYPT");
}

/** Membungkus TalkMessage dari LINEJS sebagai ChatMessage. */
export class LineChatMessage implements ChatMessage {
  constructor(
    private readonly message: TalkMessage,
    private readonly resolver: LineMessageResolver,
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
    return resolved ? new LineChatMessage(resolved, this.resolver) : null;
  }

  /**
   * LINEJS membalas dengan E2EE hanya kalau pesan aslinya terenkripsi. Pesan media tidak, padahal
   * server menuntut E2EE di chat itu (E2EE_RETRY_ENCRYPT), jadi ulangi dengan E2EE kalau ditolak.
   */
  async reply(text: string): Promise<void> {
    try {
      await this.message.reply(text);
    } catch (error) {
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
}
