export type MediaKind = "image" | "video";

/** Pesan masuk dalam bentuk yang tidak bergantung pada library chat mana pun. */
export interface ChatMessage {
  readonly id: string;
  /** Id pengguna pengirim. */
  readonly senderId: string;
  readonly text: string;
  readonly isFromSelf: boolean;
  /** Jenis media pesan ini, atau null kalau pesan teks/lainnya. */
  readonly mediaKind: MediaKind | null;
  /** Id chat tempat pesan ini dikirim (grup atau teman). */
  readonly chatId: string;
  readonly isGroupChat: boolean;
  /** Id pengguna yang di-mention (tanpa @all). */
  readonly mentionedIds: string[];
  reply(text: string): Promise<void>;
  downloadMedia(): Promise<Buffer>;
  /** Pesan yang di-reply oleh pesan ini, atau null kalau bukan reply. */
  repliedMessage(): Promise<ChatMessage | null>;
}
