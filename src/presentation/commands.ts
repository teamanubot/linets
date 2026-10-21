import type { ProfileFlow } from "../application/profile-flow.ts";
import type { ChatMessage } from "../domain/chat.ts";

export const COMMAND_PREFIX = "tab";

const HELP_TEXT = [
  "Perintah:",
  "tab pp - ganti foto profil (video profil, kalau ada, tidak diubah)",
  "tab vp - ganti foto + video profil (kirim foto, lalu video)",
  "tab vp2 - ganti video profil saja (foto tidak diubah)",
  "tab batal - batalkan",
  "tab help, tab ping, tab me, tab echo <teks>",
].join("\n");

export type Command = (args: string, message: ChatMessage) => Promise<void>;

export interface CommandDeps {
  profileFlow: ProfileFlow;
  displayName: string;
}

export function createCommands({ profileFlow, displayName }: CommandDeps): Record<string, Command> {
  return {
    help: (_args, message) => message.reply(HELP_TEXT),
    ping: (_args, message) => message.reply("pong 🏓"),
    echo: (args, message) => message.reply(args || "(kosong)"),
    me: (_args, message) => message.reply(`Nama: ${displayName}`),
    pp: (_args, message) => profileFlow.start("pp", message),
    vp: (_args, message) => profileFlow.start("vp", message),
    vp2: (_args, message) => profileFlow.start("vp2", message),
    batal: async (_args, message) => {
      profileFlow.cancel();
      await message.reply("Dibatalkan.");
    },
  };
}

/** Pecah "tab <nama> [argumen]"; null kalau pesan bukan perintah. */
export function parseCommand(text: string): { name: string; args: string } | null {
  const [prefix, name, ...rest] = text.trim().split(/\s+/);
  if (prefix?.toLowerCase() !== COMMAND_PREFIX || !name) return null;
  return { name: name.toLowerCase(), args: rest.join(" ") };
}
