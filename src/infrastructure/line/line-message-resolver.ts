import { TalkMessage, type Client } from "@tab/linets";

const CACHE_LIMIT = 200;
const HISTORY_LIMIT = 100;

/**
 * Mencari pesan dari id-nya. `getReplyTarget()` di LINEJS hanya memberi id pesan yang di-reply
 * (resolver bawaannya belum diimplementasikan), jadi pesan dicari di cache pesan yang baru masuk,
 * lalu di riwayat chat dari server.
 */
export class LineMessageResolver {
  private readonly cache = new Map<string, TalkMessage>();

  constructor(private readonly client: Client) {}

  /** Expose client-nya; dipakai LineChatMessage untuk mendaftar ulang kunci E2EE grup kalau perlu. */
  getClient(): Client {
    return this.client;
  }

  remember(message: TalkMessage): void {
    this.cache.delete(message.raw.id);
    this.cache.set(message.raw.id, message);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  async resolve(messageId: string, chatId: string): Promise<TalkMessage | null> {
    return this.cache.get(messageId) ?? (await this.findInHistory(messageId, chatId));
  }

  private async findInHistory(messageId: string, chatId: string): Promise<TalkMessage | null> {
    const { talk } = this.client.base;
    const { messageBoxes } = await talk.getMessageBoxes({ messageBoxListRequest: {} });
    const box = messageBoxes.find((candidate) => candidate.id === chatId);
    if (!box) return null;

    const history = await talk.getPreviousMessagesV2WithRequest({
      request: {
        messageBoxId: box.id,
        endMessageId: {
          messageId: box.lastDeliveredMessageId.messageId,
          deliveredTime: box.lastDeliveredMessageId.deliveredTime,
        },
        messagesCount: HISTORY_LIMIT,
      },
    });
    const raw = history.find((message) => message.id === messageId);
    return raw ? TalkMessage.fromRawTalk(raw, this.client) : null;
  }
}
