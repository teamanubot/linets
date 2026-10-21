/** Akses ke foto profil akun (diimplementasikan oleh infrastructure). */
export interface ProfileGateway {
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

/** Pengolahan gambar/video (diimplementasikan oleh infrastructure). */
export interface MediaProcessor {
  /** Ubah gambar apa pun jadi JPEG persegi 640x640. */
  toSquareJpeg(image: Buffer): Promise<Buffer>;
  /** Ambil frame pertama video sebagai JPEG persegi 640x640. */
  extractSquareFrame(video: Buffer): Promise<Buffer>;
}
