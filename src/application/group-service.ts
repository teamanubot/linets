import type { ChatMessage } from "../domain/chat.ts";
import type { GroupGateway } from "../domain/ports.ts";

const MAX_GROUP_NAME = 50;
const USER_ID_PATTERN = /\bu[0-9a-f]{32}\b/g;
const TICKET_IN_URL = /\/ti\/g\/([\w-]+)/;
const TICKET_ONLY = /^[\w-]{6,}$/;

/** Ambil tiket grup dari link `https://line.me/R/ti/g/<tiket>` atau tiket polos. */
export function parseGroupTicket(input: string): string | null {
  const text = input.trim();
  return text.match(TICKET_IN_URL)?.[1] ?? (TICKET_ONLY.test(text) ? text : null);
}

/** Perintah grup. Semua kecuali `join` hanya berlaku di chat grup. */
export class GroupService {
  constructor(
    private readonly groups: GroupGateway,
    private readonly selfId: string,
  ) {}

  async createLink(message: ChatMessage): Promise<void> {
    if (!(await this.requireGroup(message))) return;
    const link = await this.groups.createInviteLink(message.chatId);
    await message.reply(`Link grup:\n${link}`);
  }

  async join(args: string, message: ChatMessage): Promise<void> {
    const ticket = parseGroupTicket(args);
    if (!ticket) return message.reply("Pakai: tab join <link grup>\nContoh: tab join https://line.me/R/ti/g/AbCdEfGhIj");
    const name = await this.groups.joinByTicket(ticket);
    await message.reply(`✅ Berhasil bergabung ke grup "${name}".`);
  }

  async rename(name: string, message: ChatMessage): Promise<void> {
    if (!(await this.requireGroup(message))) return;
    if (!name) return message.reply("Pakai: tab namagrup <nama baru>");
    if (name.length > MAX_GROUP_NAME) {
      return message.reply(`Nama grup terlalu panjang (${name.length}/${MAX_GROUP_NAME} karakter).`);
    }
    await this.groups.rename(message.chatId, name);
    await message.reply(`✅ Berhasil: nama grup diganti jadi "${name}".`);
  }

  async invite(args: string, message: ChatMessage): Promise<void> {
    if (!(await this.requireGroup(message))) return;
    const userIds = [...new Set([...message.mentionedIds, ...(args.match(USER_ID_PATTERN) ?? [])])];
    if (userIds.length === 0) return message.reply("Pakai: tab invite @teman (mention) atau tab invite <id pengguna>");
    await this.groups.invite(message.chatId, userIds);
    await message.reply(`✅ Berhasil mengundang ${userIds.length} orang.`);
  }

  async kick(message: ChatMessage): Promise<void> {
    if (!(await this.requireGroup(message))) return;
    const userIds = message.mentionedIds.filter((id) => id !== this.selfId);
    if (userIds.length === 0) return message.reply("Pakai: tab tendang @orang (mention orangnya).");
    await this.groups.kick(message.chatId, userIds);
    await message.reply(`✅ Berhasil mengeluarkan ${userIds.length} orang dari grup.`);
  }

  async leave(args: string, message: ChatMessage): Promise<void> {
    if (!(await this.requireGroup(message))) return;
    if (args.toLowerCase() !== "ya") {
      return message.reply('Yakin keluar dari grup ini? Ketik "tab keluar ya" untuk konfirmasi.');
    }
    await message.reply("Keluar dari grup...");
    await this.groups.leave(message.chatId);
  }

  /**
   * Perintah `tab kickall`: langsung keluarkan semua anggota grup ini (kecuali pemilik akun sendiri) selama
   * akun ini memang admin/punya izin mengeluarkan orang di grup tersebut. Hanya untuk grup milikmu sendiri
   * yang memang ingin kamu bubarkan; bukan cara memasuki atau mengambil alih grup orang lain. Tanpa
   * konfirmasi tambahan — pastikan kamu memang di grup yang benar sebelum mengetiknya.
   */
  async kickAll(_args: string, message: ChatMessage): Promise<void> {
    if (!(await this.requireGroup(message))) return;
    await message.reply("Mengeluarkan semua anggota grup...");
    const members = await this.groups.members(message.chatId);
    const targets = members.filter((id) => id !== this.selfId);
    if (targets.length === 0) return message.reply("Tidak ada anggota lain untuk dikeluarkan.");
    try {
      await this.groups.kick(message.chatId, targets);
      await message.reply(`✅ Selesai. Target: ${targets.length} orang (sebagian mungkin gagal kalau akunmu bukan admin; cek daftar anggota grup untuk memastikan).`);
    } catch (error) {
      await message.reply(`❌ Gagal mengeluarkan siapa pun (mungkin akunmu bukan admin di grup ini): ${(error as Error).message}`);
    }
  }

  private async requireGroup(message: ChatMessage): Promise<boolean> {
    if (message.isGroupChat) return true;
    await message.reply("Perintah ini hanya bisa dipakai di chat grup.");
    return false;
  }
}
