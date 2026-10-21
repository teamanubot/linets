import type { Client, TalkMessage } from "@tab/linets";
import type { ProfileFlow } from "../application/profile-flow.ts";
import { LineChatMessage } from "../infrastructure/line/line-chat-message.ts";
import { createCommands, parseCommand } from "./commands.ts";

export interface LineBotDeps {
  client: Client;
  profileFlow: ProfileFlow;
  displayName: string;
}

/** Hubungkan event pesan LINE ke perintah dan alur profil, lalu mulai mendengarkan. */
export function startLineBot({ client, profileFlow, displayName }: LineBotDeps): void {
  const commands = createCommands({ profileFlow, displayName });

  client.on("message", async (talkMessage: TalkMessage) => {
    const message = new LineChatMessage(talkMessage);
    // Hanya respons pesan dari akun sendiri agar tidak spam orang lain (risiko ban).
    if (!message.isFromSelf) return;

    try {
      if (await profileFlow.handleMedia(message)) return;

      const command = parseCommand(message.text);
      if (command) await commands[command.name]?.(command.args, message);
    } catch (error) {
      console.error("Gagal memproses pesan:", error);
      profileFlow.cancel();
      const reason = error instanceof Error ? error.message : String(error);
      await message.reply(`❌ Gagal: ${reason}`).catch(() => {});
    }
  });

  client.listen({ talk: true });
}
