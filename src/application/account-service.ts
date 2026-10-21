import type { ChatMessage } from "../domain/chat.ts";
import type { ProfileGateway } from "../domain/ports.ts";

const MAX_DISPLAY_NAME = 20;
const MAX_STATUS_MESSAGE = 500;

/** Ubah teks profil akun: nama tampilan dan status. */
export class AccountService {
  constructor(private readonly profile: ProfileGateway) {}

  async setName(name: string, message: ChatMessage): Promise<void> {
    if (!name) return message.reply("Pakai: tab nama <nama baru>");
    if (name.length > MAX_DISPLAY_NAME) {
      return message.reply(`Nama terlalu panjang (${name.length}/${MAX_DISPLAY_NAME} karakter).`);
    }
    await this.profile.setDisplayName(name);
    await message.reply(`✅ Berhasil: nama diganti jadi "${name}".`);
  }

  async setStatus(text: string, message: ChatMessage): Promise<void> {
    if (text.length > MAX_STATUS_MESSAGE) {
      return message.reply(`Status terlalu panjang (${text.length}/${MAX_STATUS_MESSAGE} karakter).`);
    }
    await this.profile.setStatusMessage(text);
    await message.reply(text ? `✅ Berhasil: status diganti jadi "${text}".` : "✅ Berhasil: status dikosongkan.");
  }
}
