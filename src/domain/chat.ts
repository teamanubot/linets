export type MediaKind = "image" | "video";

/** Detail sticker (dari paket mana, id berapa), untuk anti-unsend. */
export interface StickerInfo {
  packageId: string;
  stickerId: string;
}

/** Detail lokasi yang dibagikan, untuk anti-unsend. */
export interface LocationInfo {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
}

/** Detail file yang dikirim (bukan gambar/video), untuk anti-unsend. */
export interface FileInfo {
  name: string;
  size: number;
}

/** Pesan masuk dalam bentuk yang tidak bergantung pada library chat mana pun. */
export interface ChatMessage {
  readonly id: string;
  /** Id pengguna pengirim. */
  readonly senderId: string;
  readonly text: string;
  readonly isFromSelf: boolean;
  /** Jenis media pesan ini (gambar/video saja), atau null kalau bukan. Dipakai alur ganti foto/video profil. */
  readonly mediaKind: MediaKind | null;
  /** Detail sticker kalau pesan ini sticker, selain itu null. Dipakai anti-unsend. */
  readonly sticker: StickerInfo | null;
  /** Detail lokasi kalau pesan ini membagikan lokasi, selain itu null. Dipakai anti-unsend. */
  readonly location: LocationInfo | null;
  /** Detail file kalau pesan ini file (bukan gambar/video), selain itu null. Dipakai anti-unsend. */
  readonly file: FileInfo | null;
  /** Id chat tempat pesan ini dikirim (grup atau teman). */
  readonly chatId: string;
  readonly isGroupChat: boolean;
  /** Id pengguna yang di-mention (tanpa @all). */
  readonly mentionedIds: string[];
  reply(text: string): Promise<void>;
  downloadMedia(): Promise<Buffer>;
  /** Tandai pesan ini sudah dibaca (dipakai oleh auto-read). */
  markAsRead(): Promise<void>;
  /** Pesan yang di-reply oleh pesan ini, atau null kalau bukan reply. */
  repliedMessage(): Promise<ChatMessage | null>;
}
