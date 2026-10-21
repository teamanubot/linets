/** Gambar statis + video opsional, dipakai untuk foto profil maupun cover profil. */
export interface PictureGateway {
  hasVideo(): Promise<boolean>;
  /** Ganti gambar profil. Video profil yang ada ikut terhapus. */
  setImage(jpg: Buffer): Promise<void>;
  /** Ganti gambar statis saja; video profil yang ada tetap dipakai. */
  setImageKeepVideo(jpg: Buffer): Promise<void>;
  /** Ganti video sekaligus gambar statisnya. */
  setVideo(video: Buffer, image: Buffer): Promise<void>;
  /** Ganti video saja; gambar statis yang ada tetap dipakai. */
  setVideoKeepImage(video: Buffer): Promise<void>;
}

/** Akses ke foto profil akun (diimplementasikan oleh infrastructure). */
export interface ProfileGateway extends PictureGateway {
  setDisplayName(name: string): Promise<void>;
  setStatusMessage(text: string): Promise<void>;
}

/** Bentuk gambar: foto profil persegi 640x640, cover potret 540x960. */
export type ImageShape = "square" | "portrait";

/** Pengolahan gambar/video (diimplementasikan oleh infrastructure). */
export interface MediaProcessor {
  /** Ubah gambar apa pun jadi JPEG dengan bentuk tertentu (dipotong di tengah). */
  toJpeg(image: Buffer, shape: ImageShape): Promise<Buffer>;
  /** Ambil frame pertama video sebagai JPEG dengan bentuk tertentu. */
  extractFrame(video: Buffer, shape: ImageShape): Promise<Buffer>;
  /** Potong video menjadi paling lama `maxSeconds` detik (tanpa encode ulang). */
  trimVideo(video: Buffer, maxSeconds: number): Promise<Buffer>;
}

/** Operasi grup (diimplementasikan oleh infrastructure). */
export interface GroupGateway {
  /** Aktifkan undangan lewat link dan buat tiketnya; mengembalikan URL link grup. */
  createInviteLink(chatId: string): Promise<string>;
  /** Gabung grup lewat tiket; mengembalikan nama grup. */
  joinByTicket(ticketId: string): Promise<string>;
  rename(chatId: string, name: string): Promise<void>;
  invite(chatId: string, userIds: string[]): Promise<void>;
  kick(chatId: string, userIds: string[]): Promise<void>;
  leave(chatId: string): Promise<void>;
}

/** Penyimpanan media yang diunduh (diimplementasikan oleh infrastructure). */
export interface MediaStore {
  /** Simpan media dan kembalikan path file-nya. */
  save(data: Buffer, kind: "image" | "video"): Promise<string>;
}

/** Pengaturan bot yang disimpan antar-sesi. */
export interface BotSettings {
  autoReply: { enabled: boolean; text: string };
  antiUnsend: { enabled: boolean };
}

export const DEFAULT_SETTINGS: BotSettings = {
  autoReply: { enabled: false, text: "" },
  antiUnsend: { enabled: true },
};

export interface SettingsStore {
  load(): Promise<BotSettings>;
  save(settings: BotSettings): Promise<void>;
}

/** Mengirim pemberitahuan ke pemilik akun (chat dengan diri sendiri). */
export interface Notifier {
  notify(text: string): Promise<void>;
}

/** Mencari nama tampilan pengguna. */
export interface PeopleDirectory {
  displayName(userId: string): Promise<string>;
}
