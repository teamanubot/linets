import type { TalkMessage } from "@evex/linejs";
import type { ChatMessage, MediaKind } from "../../domain/chat.ts";

/** Membungkus TalkMessage dari LINEJS sebagai ChatMessage. */
export class LineChatMessage implements ChatMessage {
  constructor(private readonly message: TalkMessage) {}

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

  reply(text: string): Promise<void> {
    return this.message.reply(text);
  }

  async downloadMedia(): Promise<Buffer> {
    return Buffer.from(await (await this.message.getData()).arrayBuffer());
  }
}
