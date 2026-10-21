import type { Client, TalkMessage } from "@tab/linets";
import type { PeopleDirectory } from "../domain/ports.ts";
import type { CommandDeps } from "./commands.ts";
import { LineChatMessage } from "../infrastructure/line/line-chat-message.ts";
import { LineMessageResolver } from "../infrastructure/line/line-message-resolver.ts";
import { createCommands, parseCommand } from "./commands.ts";
import { createConsoleLogger, logged, shorten, type Logger } from "./logger.ts";
import { LoggingChatMessage, previewOf } from "./logging-decorators.ts";
import { isFromBeforeStart } from "./stale-messages.ts";

export interface LineBotDeps extends CommandDeps {
  client: Client;
  people: PeopleDirectory;
  logger?: Logger;
}

const NAME_LOOKUP_TIMEOUT_MS = 1500;

/** Nama tampilan untuk log; kalau lambat atau gagal, pakai id singkatnya. */
async function nameForLog(people: PeopleDirectory, userId: string): Promise<string> {
  const fallback = `${userId.slice(0, 8)}…`;
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(fallback), NAME_LOOKUP_TIMEOUT_MS));
  return Promise.race([people.displayName(userId).catch(() => fallback), timeout]);
}

/** Hubungkan event pesan LINE ke perintah dan alur profil, lalu mulai mendengarkan. */
export function startLineBot({ client, people, logger = createConsoleLogger(), ...commandDeps }: LineBotDeps): void {
  const { profileFlow, coverFlow, antiUnsend, autoReply, speedTest } = commandDeps;
  const commands = createCommands(commandDeps);
  const resolver = new LineMessageResolver(client);
  const startedAt = Date.now();
  let ignoredStale = 0;

  const flows = [
    { name: "profil", flow: profileFlow },
    { name: "cover", flow: coverFlow },
  ];

  client.on("event", (operation) => {
    // param1 = id chat, param2 = id pesan yang ditarik.
    if (operation.type === "DESTROY_MESSAGE" || operation.type === "NOTIFIED_DESTROY_MESSAGE") {
      antiUnsend
        .onUnsent(operation.param2)
        .then((notified) => notified && logger.info("anti-unsend → isi pesan yang ditarik dikirim ke chat sendiri"))
        .catch((error) => logger.error(`anti-unsend → gagal: ${shorten(String(error?.message ?? error), 120)}`));
    }
  });

  client.on("message", async (talkMessage: TalkMessage) => {
    resolver.remember(talkMessage);
    const incoming = new LineChatMessage(talkMessage, resolver);
    antiUnsend.remember(incoming);
    speedTest.observe(incoming);
    // Semua balasan yang dikirim bot lewat `message` otomatis dicatat di log.
    const message = new LoggingChatMessage(incoming, logger);

    // Pesan dari sebelum bot menyala hanya dicatat (untuk anti-unsend), tidak dijalankan.
    if (isFromBeforeStart(Number(talkMessage.raw.createdTime), startedAt)) {
      if (++ignoredStale === 1) logger.info("Mengabaikan pesan lama dari sebelum bot menyala.");
      return;
    }

    // Perintah hanya dari akun sendiri. Pesan orang lain hanya memicu auto-reply (jika aktif).
    if (!message.isFromSelf) {
      const sender = await nameForLog(people, message.senderId);
      logger.info(`📩 menerima pesan dari ${sender} (${message.isGroupChat ? "grup" : "pribadi"}): ${previewOf(message.text, message.mediaKind)}`);
      try {
        if (await autoReply.handleIncoming(message)) logger.info(`🤖 auto-reply ke ${sender}`);
      } catch (error) {
        logger.error(`auto-reply → gagal: ${shorten(String((error as Error)?.message ?? error), 120)}`);
      }
      return;
    }

    try {
      const kind = message.mediaKind;
      for (const { name, flow } of flows) {
        if (kind && flow.isActive) {
          const label = `proses ${kind === "image" ? "gambar" : "video"} (alur ${name})`;
          logger.info(`📥 menerima ${kind === "image" ? "gambar" : "video"} untuk alur ${name}`);
          if (await logged(logger, label, () => flow.handleMedia(message))) return;
        }
      }

      const command = parseCommand(message.text);
      if (!command) return;

      const label = `tab ${command.name}${command.args ? ` ${shorten(command.args)}` : ""}`;
      logger.info(`📥 menerima perintah: ${label}`);
      const run = commands[command.name];
      if (!run) return logger.info(`⚠️ ${label} → perintah tidak dikenal`);
      await logged(logger, label, () => run(command.args, message));
    } catch (error) {
      // Sudah dicatat oleh `logged`; di sini balas pengguna dan batalkan alur yang menggantung.
      profileFlow.cancel();
      coverFlow.cancel();
      const reason = error instanceof Error ? error.message : String(error);
      await message.reply(`❌ Gagal: ${reason}`).catch(() => {});
    }
  });

  client.listen({ talk: true });
}
