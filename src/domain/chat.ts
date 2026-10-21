export type MediaKind = "image" | "video";

/** Pesan masuk dalam bentuk yang tidak bergantung pada library chat mana pun. */
export interface ChatMessage {
  readonly text: string;
  readonly isFromSelf: boolean;
  /** Jenis media pesan ini, atau null kalau pesan teks/lainnya. */
  readonly mediaKind: MediaKind | null;
  reply(text: string): Promise<void>;
  downloadMedia(): Promise<Buffer>;
}
