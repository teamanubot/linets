import type { ChatMessage, MediaKind } from "../domain/chat.ts";
import type { MediaSender, Notifier } from "../domain/ports.ts";
import { shorten, type Logger } from "./logger.ts";

/** Pratinjau isi pesan untuk log: teks dipotong, media/stiker diberi label. */
export function previewOf(text: string, mediaKind: MediaKind | null): string {
  if (mediaKind) return mediaKind === "image" ? "[gambar]" : "[video]";
  return text ? `"${shorten(text, 60)}"` : "[pesan non-teks]";
}

const chatLabel = (isGroupChat: boolean) => (isGroupChat ? "grup" : "pribadi");

/** Membungkus pesan masuk: setiap balasan yang dikirim bot dicatat di log. */
export class LoggingChatMessage implements ChatMessage {
  constructor(
    private readonly inner: ChatMessage,
    private readonly logger: Logger,
  ) {}

  get id() { return this.inner.id; }
  get senderId() { return this.inner.senderId; }
  get text() { return this.inner.text; }
  get isFromSelf() { return this.inner.isFromSelf; }
  get mediaKind() { return this.inner.mediaKind; }
  get chatId() { return this.inner.chatId; }
  get isGroupChat() { return this.inner.isGroupChat; }
  get mentionedIds() { return this.inner.mentionedIds; }

  downloadMedia() {
    return this.inner.downloadMedia();
  }

  async repliedMessage(): Promise<ChatMessage | null> {
    const replied = await this.inner.repliedMessage();
    return replied && new LoggingChatMessage(replied, this.logger);
  }

  async reply(text: string): Promise<void> {
    this.logger.info(`📤 kirim (${chatLabel(this.inner.isGroupChat)}): ${previewOf(text, null)}`);
    await this.inner.reply(text);
  }
}

/** Mencatat gambar/video yang dikirim bot ke chat. */
export class LoggingMediaSender implements MediaSender {
  constructor(
    private readonly inner: MediaSender,
    private readonly logger: Logger,
  ) {}

  async sendImage(chatId: string, image: Buffer): Promise<void> {
    this.logger.info(`📤 kirim gambar (${(image.length / 1024).toFixed(0)} KB)`);
    await this.inner.sendImage(chatId, image);
  }

  async sendVideo(chatId: string, video: Buffer, durationMs: number): Promise<void> {
    this.logger.info(`📤 kirim video (${(video.length / 1024 / 1024).toFixed(1)} MB, ${(durationMs / 1000).toFixed(0)} dtk)`);
    await this.inner.sendVideo(chatId, video, durationMs);
  }
}

/** Mencatat pemberitahuan yang dikirim bot ke chat dengan diri sendiri. */
export class LoggingNotifier implements Notifier {
  constructor(
    private readonly inner: Notifier,
    private readonly logger: Logger,
  ) {}

  async notify(text: string): Promise<void> {
    this.logger.info(`📤 kirim ke chat sendiri: ${previewOf(text, null)}`);
    await this.inner.notify(text);
  }
}
