import type { ChatMessage } from "../domain/chat.ts";
import type { MediaStore } from "../domain/ports.ts";

/** Simpan gambar/video dari pesan yang di-reply. */
export class MediaSaver {
  constructor(private readonly store: MediaStore) {}

  async saveReplied(message: ChatMessage): Promise<void> {
    const target = await message.repliedMessage();
    if (!target) return message.reply("Reply ke gambar/video (yang masih baru) lalu ketik: tab save");
    if (!target.mediaKind) return message.reply("Pesan yang di-reply bukan gambar/video.");

    const data = await target.downloadMedia();
    const path = await this.store.save(data, target.mediaKind);
    await message.reply(`✅ Tersimpan (${(data.length / 1024 / 1024).toFixed(1)} MB): ${path}`);
  }
}
