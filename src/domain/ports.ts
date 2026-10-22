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

/** Cara membuat video jadi persegi: seluruh gambar dimuat dengan latar buram, atau dipotong di tengah. */
export type SquareVideoMode = "fit" | "crop";

export interface SquareVideoOptions {
  mode: SquareVideoMode;
  /** Sisi persegi dalam piksel, mis. 1080 atau 2160. */
  side: number;
  /** Batas bitrate video (kbps); menjaga ukuran file di bawah batas upload LINE. */
  videoKbps: number;
}

/** Pengolahan gambar/video (diimplementasikan oleh infrastructure). */
export interface MediaProcessor {
  /** Ubah gambar apa pun jadi JPEG dengan bentuk tertentu (dipotong di tengah). */
  toJpeg(image: Buffer, shape: ImageShape): Promise<Buffer>;
  /** Ambil frame pertama video sebagai JPEG dengan bentuk tertentu. */
  extractFrame(video: Buffer, shape: ImageShape): Promise<Buffer>;
  /** Potong video menjadi paling lama `maxSeconds` detik (tanpa encode ulang). */
  trimVideo(video: Buffer, maxSeconds: number): Promise<Buffer>;
  /** Durasi video dalam milidetik. */
  videoDurationMs(video: Buffer): Promise<number>;
  /** Ubah file video jadi persegi (H.264 + suara AAC) dengan ukuran dan bitrate tertentu. */
  toSquareVideo(inputPath: string, options: SquareVideoOptions): Promise<Buffer>;
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
  /** Id semua anggota grup (termasuk pemilik akun sendiri). */
  members(chatId: string): Promise<string[]>;
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
  /** LIFF app yang dipakai untuk mengirim Flex Message; kosong = belum diatur. */
  liff: { id: string };
  /** Gaya dan tema bawaan kartu Flex (nama gaya/tema divalidasi oleh aplikasi). */
  flex: { style: string; theme: string; /** Teks kiri bar bawah gaya `latar`. */ credit: string };
  /** Deteksi kick massal (serangan bot jahat) di grup; lihat [[GroupGuard]]. */
  groupGuard: { enabled: boolean };
}

export const DEFAULT_SETTINGS: BotSettings = {
  autoReply: { enabled: false, text: "" },
  antiUnsend: { enabled: true },
  liff: { id: "" },
  flex: { style: "chino", theme: "pink", credit: "Powered By TeamAnuBot" },
  groupGuard: { enabled: true },
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

/** Satu panggilan API ringan ke server chat, untuk mengukur waktu respon. */
export interface ApiProbe {
  ping(): Promise<void>;
}

export interface VideoInfo {
  title: string;
  durationSeconds: number;
  /** Tinggi video terbaik yang tersedia (maks. 2160), untuk memilih kualitas. */
  maxHeight: number;
}

/** Video hasil unduhan di disk; panggil `dispose()` untuk menghapus file sementaranya. */
export interface DownloadedVideo {
  path: string;
  dispose(): Promise<void>;
}

/** Mengunduh video dari internet (diimplementasikan oleh infrastructure). */
export interface VideoDownloader {
  info(url: string): Promise<VideoInfo>;
  /** Unduh kualitas terbaik sampai `maxHeight` (video + audio) ke file sementara. */
  download(url: string, maxHeight: number): Promise<DownloadedVideo>;
}

export interface UserPicture {
  name: string;
  /** Foto profil, atau null kalau tidak punya. */
  image: Buffer | null;
  /** Video profil, atau null kalau tidak punya. */
  video: Buffer | null;
}

/** Melihat foto/video profil pengguna mana pun (diimplementasikan oleh infrastructure). */
export interface ProfileViewer {
  fetchPicture(userId: string): Promise<UserPicture>;
}

/** Mengirim gambar/video/audio ke sebuah chat (diimplementasikan oleh infrastructure). */
export interface MediaSender {
  sendImage(chatId: string, image: Buffer): Promise<void>;
  sendVideo(chatId: string, video: Buffer, durationMs: number): Promise<void>;
  sendAudio(chatId: string, audio: Buffer, durationMs: number): Promise<void>;
}

/** Jenis satu berkas hasil unduhan: video (dengan suara), audio saja (mp3), atau gambar (foto post/thumbnail). */
export type DownloadKind = "video" | "audio" | "image";

/** Satu berkas dari hasil unduhan (postingan karusel bisa punya lebih dari satu, campur foto & video). */
export interface FetchedMediaItem {
  path: string;
  kind: DownloadKind;
}

/** Hasil unduh media sosial di disk; panggil `dispose()` sekali untuk menghapus semua file sementaranya. */
export interface FetchedMedia {
  title: string;
  /** Satu item untuk postingan biasa; beberapa item (urut) untuk karusel foto/video. */
  items: FetchedMediaItem[];
  dispose(): Promise<void>;
}

/**
 * Mengunduh media dari Instagram/Twitter(X)/Facebook/TikTok/YouTube (diimplementasikan oleh infrastructure).
 * Jenisnya (video/foto, atau campuran untuk karusel) dideteksi otomatis dari postingannya, bukan dipilih pengguna.
 */
export interface MediaFetcher {
  /** `forceAudio`: lewati deteksi otomatis, selalu ekstrak audio mp3 (dipakai khusus oleh dl-ytmp3). */
  fetch(url: string, forceAudio?: boolean): Promise<FetchedMedia>;
}

/** Satu hasil pencarian: judul/caption, pembuat (kalau ada), link ke postingannya, info singkat tambahan (durasi dsb). */
export interface SearchResultItem {
  title: string;
  author?: string;
  link: string;
  extra?: string;
}

/** Mencari media di sebuah platform (diimplementasikan oleh infrastructure, satu per platform). */
export interface SearchProvider {
  /** Ambil sampai `limit` hasil teratas untuk query ini; bisa mengembalikan lebih sedikit kalau platform tidak punya/tidak bisa ambil sebanyak itu. */
  search(query: string, limit: number): Promise<SearchResultItem[]>;
}

/** Mengirim Flex Message sebagai akun sendiri (lewat LIFF). */
export interface FlexSender {
  send(chatId: string, liffId: string, altText: string, contents: Record<string, unknown>): Promise<void>;
}

/** Identitas akun sendiri untuk ditampilkan di kartu (nama dan foto profil publik). */
export interface SelfIdentity {
  name: string;
  /** URL foto profil (https), atau tidak ada kalau akun belum punya foto. */
  pictureUrl?: string;
}

export interface IdentityProvider {
  current(): Promise<SelfIdentity>;
}

/** Fakta tentang sebuah gambar di internet, untuk memperingatkan animasi yang tidak akan diputar. */
export interface ImageFacts {
  /** Ukuran file (byte), kalau diketahui. */
  bytes?: number;
  kind: "apng" | "png" | "gif" | "jpeg" | "other";
  /** Hanya APNG: jumlah putaran (0 = tanpa henti). */
  plays?: number;
  frames?: number;
}

export interface ImageInspector {
  /** Periksa gambar di URL; null kalau tidak bisa diakses. */
  inspect(url: string): Promise<ImageFacts | null>;
}
