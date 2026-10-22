import type { ChatMessage } from "../domain/chat.ts";
import type { BotSettings, SettingsStore } from "../domain/ports.ts";

export interface AutoReplyDeps {
  store: SettingsStore;
  now?: () => number;
}

const MAX_TEXT_LENGTH = 500;
const MIN_INTERVAL_MINUTES = 1;
const MAX_LIMIT = 20;

function formatInterval(ms: number): string {
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)} menit`;
  const hours = ms / 3_600_000;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} jam`;
}

/**
 * Membalas otomatis pesan pribadi dari orang lain. Default mati, dan global (bukan per chat seperti
 * anti-unsend/Group Guard — satu balasan yang sama berlaku untuk semua orang). Tiap orang dibalas paling
 * banyak `limit` kali per `intervalMs`, bisa diatur lewat `tab autoreply jeda <jam> [berapa kali]`.
 */
export class AutoReply {
  private settings!: BotSettings;
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly now: () => number;

  constructor(private readonly deps: AutoReplyDeps) {
    this.now = deps.now ?? Date.now;
  }

  async init(): Promise<void> {
    this.settings = await this.deps.store.load();
  }

  /** Mengembalikan true kalau membalas. */
  async handleIncoming(message: ChatMessage): Promise<boolean> {
    const { enabled, text, intervalMs, limit } = this.settings.autoReply;
    if (!enabled || !text || message.isFromSelf || message.isGroupChat) return false;

    const now = this.now();
    const existing = this.windows.get(message.senderId);
    const window = existing && now - existing.start < intervalMs ? existing : { start: now, count: 0 };
    if (window.count >= limit) {
      this.windows.set(message.senderId, window);
      return false;
    }

    window.count++;
    this.windows.set(message.senderId, window);
    await message.reply(text);
    return true;
  }

  /** Ringkasan satu baris untuk `tab stat`. */
  describe(): string {
    const { enabled, limit, intervalMs } = this.settings.autoReply;
    return enabled ? `AKTIF (maks. ${limit}x per orang tiap ${formatInterval(intervalMs)})` : "MATI";
  }

  /** Perintah `tab autoreply [teks | off | jeda <jam> [berapa kali]]`. */
  async configure(args: string, message: ChatMessage): Promise<void> {
    const trimmed = args.trim();
    const { enabled, text, intervalMs, limit } = this.settings.autoReply;

    if (!trimmed) {
      return message.reply(
        enabled
          ? `Auto-reply AKTIF:\n"${text}"\nJeda: maks. ${limit}x per orang tiap ${formatInterval(intervalMs)}.`
          : "Auto-reply MATI. Pakai: tab autoreply <teks balasan>",
      );
    }
    if (/^jeda(\s|$)/i.test(trimmed)) return this.configureInterval(trimmed, message);
    if (trimmed.toLowerCase() === "off") {
      await this.update({ enabled: false, text, intervalMs, limit });
      return message.reply("Auto-reply dimatikan.");
    }
    if (trimmed.toLowerCase() === "on") {
      if (!text) return message.reply("Belum ada teks balasan sebelumnya. Pakai: tab autoreply <teks balasan>");
      await this.update({ enabled: true, text, intervalMs, limit });
      return message.reply(`✅ Auto-reply diaktifkan kembali:\n"${text}"\n(maks. ${limit}x per orang tiap ${formatInterval(intervalMs)})`);
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      return message.reply(`Teks terlalu panjang (${trimmed.length}/${MAX_TEXT_LENGTH} karakter).`);
    }
    await this.update({ enabled: true, text: trimmed, intervalMs, limit });
    await message.reply(`✅ Auto-reply aktif. Pesan pribadi dari orang lain dibalas:\n"${trimmed}"\n(maks. ${limit}x per orang tiap ${formatInterval(intervalMs)})`);
  }

  private async configureInterval(trimmed: string, message: ChatMessage): Promise<void> {
    const [, hoursText, limitText] = trimmed.split(/\s+/);
    const hours = Number(hoursText);
    const limit = limitText !== undefined ? Number(limitText) : this.settings.autoReply.limit;
    const minHours = MIN_INTERVAL_MINUTES / 60;
    if (!Number.isFinite(hours) || hours < minHours || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return message.reply(
        "Pakai: tab autoreply jeda <jam> [berapa kali]\n" +
          "Contoh: tab autoreply jeda 2 2 → tiap 2 jam, maks. 2x balasan per orang.\n" +
          `Jam minimal ${MIN_INTERVAL_MINUTES} menit (mis. 0.5 = 30 menit); jumlah balasan 1-${MAX_LIMIT}.`,
      );
    }
    const { enabled, text } = this.settings.autoReply;
    const intervalMs = Math.round(hours * 60 * 60_000);
    await this.update({ enabled, text, intervalMs, limit });
    await message.reply(`✅ Jeda diatur: maks. ${limit}x balasan per orang tiap ${formatInterval(intervalMs)}.`);
  }

  private async update(autoReply: BotSettings["autoReply"]): Promise<void> {
    this.settings = { ...this.settings, autoReply };
    await this.deps.store.save(this.settings);
  }
}
