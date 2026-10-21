import type { Client } from "@tab/linets";
import type { MediaSender } from "../../domain/ports.ts";

const toBlob = (data: Buffer) => new Blob([new Uint8Array(data)]);

/** Mengirim gambar/video sebagai pesan biasa ke chat (grup atau pribadi). */
export class LineMediaSender implements MediaSender {
  constructor(private readonly client: Client) {}

  async sendImage(chatId: string, image: Buffer): Promise<void> {
    await this.client.base.obs.uploadObjTalk(chatId, "image", toBlob(image), undefined, "foto-profil.jpg");
  }

  async sendVideo(chatId: string, video: Buffer, durationMs: number): Promise<void> {
    await this.client.base.obs.uploadObjTalk(chatId, "video", toBlob(video), undefined, "video-profil.mp4", durationMs);
  }
}
