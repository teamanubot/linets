import type { ChatMessage } from "../domain/chat.ts";
import { DEFAULT_SETTINGS, type BotSettings, type SettingsStore } from "../domain/ports.ts";

export interface AutoReadDeps {
  store: SettingsStore;
}

/**
 * `tab autoread [on | off]`: tandai semua pesan masuk (grup & pribadi, dari orang lain) sudah dibaca otomatis.
 * Default mati. Global (bukan per chat seperti anti-unsend/Group Guard).
 */
export class AutoRead {
  private settings: BotSettings = structuredClone(DEFAULT_SETTINGS);

  constructor(private readonly deps: AutoReadDeps) {}

  async init(): Promise<void> {
    this.settings = await this.deps.store.load();
  }

  get enabled(): boolean {
    return this.settings.autoRead.enabled;
  }

  async configure(args: string, message: ChatMessage): Promise<void> {
    const choice = args.toLowerCase();
    if (choice !== "on" && choice !== "off") {
      return message.reply(`Auto-read ${this.enabled ? "AKTIF" : "MATI"}. Pakai: tab autoread on / off`);
    }
    this.settings = { ...this.settings, autoRead: { enabled: choice === "on" } };
    await this.deps.store.save(this.settings);
    await message.reply(choice === "on" ? "✅ Auto-read diaktifkan." : "Auto-read dimatikan.");
  }

  /** Mengembalikan true kalau berhasil ditandai dibaca. */
  async handleIncoming(message: ChatMessage): Promise<boolean> {
    if (!this.enabled || message.isFromSelf) return false;
    await message.markAsRead();
    return true;
  }
}
