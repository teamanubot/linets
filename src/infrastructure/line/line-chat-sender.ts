import type { Client } from "@tab/linets";
import type { ChatSender } from "../../domain/ports.ts";

/** Mengirim teks biasa ke chat mana pun (grup atau pribadi), bukan hanya ke chat dengan diri sendiri. */
export class LineChatSender implements ChatSender {
  constructor(private readonly client: Client) {}

  async sendText(chatId: string, text: string): Promise<void> {
    await this.client.sendCompactMessage(chatId, text);
  }
}
