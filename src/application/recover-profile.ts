import { readFile } from "node:fs/promises";
import type { ChatMessage } from "../domain/chat.ts";
import type { ImageShape, MediaProcessor, PictureGateway, ProfileGateway, ProfileSnapshotStore } from "../domain/ports.ts";

export interface RecoverProfileDeps {
  snapshotStore: ProfileSnapshotStore;
  profile: ProfileGateway;
  cover: PictureGateway;
  /** Untuk menormalkan gambar jadi JPEG dengan bentuk yang benar sebelum diunggah (sama seperti alur tab pp/cp). */
  media: MediaProcessor;
}

/** `tab recovery`: kembalikan nama, status, foto/video profil, dan foto/video cover ke snapshot terakhir dari `tab saveprofile`. */
export class RecoverProfile {
  constructor(private readonly deps: RecoverProfileDeps) {}

  async run(_args: string, message: ChatMessage): Promise<void> {
    const snapshot = await this.deps.snapshotStore.load();
    if (!snapshot) return message.reply("Belum ada profil yang disimpan. Pakai tab saveprofile dulu.");

    await this.deps.profile.setDisplayName(snapshot.name);
    await this.deps.profile.setStatusMessage(snapshot.statusMessage);
    const lines = [`✅ Nama & status dipulihkan ke "${snapshot.name}".`];

    lines.push(await this.restore(this.deps.profile, snapshot.profileImagePath, snapshot.profileVideoPath, "profil", "square"));
    lines.push(await this.restore(this.deps.cover, snapshot.coverImagePath, snapshot.coverVideoPath, "cover", "portrait"));

    await message.reply(lines.filter(Boolean).join("\n"));
  }

  private async restore(gateway: PictureGateway, imagePath: string | null, videoPath: string | null, label: string, shape: ImageShape): Promise<string> {
    if (!imagePath && !videoPath) return "";
    try {
      // Gambar mentah yang diunduh dari CDN LINE belum berupa JPEG persegi/potret baku; unggah profil/cover
      // menolak/merusak tampilannya kalau tidak dinormalkan dulu lewat toJpeg, sama seperti alur tab pp/cp.
      const image = imagePath ? await this.deps.media.toJpeg(await readFile(imagePath), shape) : null;
      if (videoPath) {
        const video = await readFile(videoPath);
        if (image) await gateway.setVideo(video, image);
        else await gateway.setVideoKeepImage(video);
        return `Foto + video ${label} dipulihkan.`;
      }
      await gateway.setImage(image!);
      return `Foto ${label} dipulihkan.`;
    } catch {
      return `⚠️ Foto/video ${label} tidak bisa dipulihkan (file sudah tidak ada di downloads/).`;
    }
  }
}
