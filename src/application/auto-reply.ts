import type { ChatMessage } from "../domain/chat.ts";
import type { BotSettings, SettingsStore } from "../domain/ports.ts";

export interface AutoReplyDeps {
  store: SettingsStore;
  /** Jeda minimal antar-balasan ke orang yang sama, default 30 menit. */
  cooldownMs?: number;
  now?: () => number;
}

const DEFAULT_COOLDOWN_MS = 30 * 60_000;
const MAX_TEXT_LENGTH = 500;

/**
 * Membalas otomatis pesan pribadi dari orang lain. Default mati. Hanya chat pribadi (bukan grup),
 * dan tiap orang dibalas paling sering sekali per `cooldownMs` supaya tidak seperti spam.
 */
export class AutoReply {
  private settings!: BotSettings;
  private readonly lastReplyAt = new Map<string, number>();
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(private readonly deps: AutoReplyDeps) {
    this.cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = deps.now ?? Date.now;
  }

  async init(): Promise<void> {
    this.settings = await this.deps.store.load();
  }

  /** Mengembalikan true kalau membalas. */
  async handleIncoming(message: ChatMessage): Promise<boolean> {
    const { enabled, text } = this.settings.autoReply;
    if (!enabled || !text || message.isFromSelf || message.isGroupChat) return false;

    const last = this.lastReplyAt.get(message.senderId);
    if (last !== undefined && this.now() - last < this.cooldownMs) return false;

    this.lastReplyAt.set(message.senderId, this.now());
    await message.reply(text);
    return true;
  }

  /** Perintah `tab autoreply [teks | off]`. */
  async configure(args: string, message: ChatMessage): Promise<void> {
    const { enabled, text } = this.settings.autoReply;

    if (!args) {
      return message.reply(enabled ? `Auto-reply AKTIF:\n"${text}"` : "Auto-reply MATI. Pakai: tab autoreply <teks balasan>");
    }
    if (args.toLowerCase() === "off") {
      await this.update({ enabled: false, text });
      return message.reply("Auto-reply dimatikan.");
    }
    if (args.length > MAX_TEXT_LENGTH) {
      return message.reply(`Teks terlalu panjang (${args.length}/${MAX_TEXT_LENGTH} karakter).`);
    }
    await this.update({ enabled: true, text: args });
    await message.reply(`✅ Auto-reply aktif. Pesan pribadi dari orang lain dibalas:\n"${args}"\n(maks. sekali per orang tiap ${Math.round(this.cooldownMs / 60_000)} menit)`);
  }

  private async update(autoReply: BotSettings["autoReply"]): Promise<void> {
    this.settings = { ...this.settings, autoReply };
    await this.deps.store.save(this.settings);
  }
}
