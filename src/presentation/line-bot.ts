import type { Client, TalkMessage } from "@tab/linets";
import type { CommandDeps } from "./commands.ts";
import { LineChatMessage } from "../infrastructure/line/line-chat-message.ts";
import { LineMessageResolver } from "../infrastructure/line/line-message-resolver.ts";
import { createCommands, parseCommand } from "./commands.ts";

export interface LineBotDeps extends CommandDeps {
  client: Client;
}

/** Hubungkan event pesan LINE ke perintah dan alur profil, lalu mulai mendengarkan. */
export function startLineBot({ client, ...commandDeps }: LineBotDeps): void {
  const { profileFlow, coverFlow } = commandDeps;
  const commands = createCommands(commandDeps);
  const resolver = new LineMessageResolver(client);

  const { antiUnsend, autoReply } = commandDeps;

  client.on("event", (operation) => {
    // param1 = id chat, param2 = id pesan yang ditarik.
    if (operation.type === "DESTROY_MESSAGE" || operation.type === "NOTIFIED_DESTROY_MESSAGE") {
      antiUnsend.onUnsent(operation.param2).catch((error) => console.error("Anti-unsend gagal:", error));
    }
  });

  client.on("message", async (talkMessage: TalkMessage) => {
    resolver.remember(talkMessage);
    const message = new LineChatMessage(talkMessage, resolver);
    antiUnsend.remember(message);

    // Perintah hanya dari akun sendiri. Pesan orang lain hanya memicu auto-reply (jika aktif).
    if (!message.isFromSelf) {
      await autoReply.handleIncoming(message).catch((error) => console.error("Auto-reply gagal:", error));
      return;
    }

    try {
      if ((await profileFlow.handleMedia(message)) || (await coverFlow.handleMedia(message))) return;

      const command = parseCommand(message.text);
      if (command) await commands[command.name]?.(command.args, message);
    } catch (error) {
      console.error("Gagal memproses pesan:", error);
      profileFlow.cancel();
      coverFlow.cancel();
      const reason = error instanceof Error ? error.message : String(error);
      await message.reply(`❌ Gagal: ${reason}`).catch(() => {});
    }
  });

  client.listen({ talk: true });
}
