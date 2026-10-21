import type { ChatMessage, MediaKind } from "../domain/chat.ts";
import { DEFAULT_SETTINGS, type BotSettings, type Notifier, type PeopleDirectory, type SettingsStore } from "../domain/ports.ts";

interface Remembered {
  senderId: string;
  isGroupChat: boolean;
  text: string;
  mediaKind: MediaKind | null;
}

export interface AntiUnsendDeps {
  store: SettingsStore;
  notifier: Notifier;
  people: PeopleDirectory;
  /** Catat juga pesan dari akun sendiri (untuk uji); default hanya pesan orang lain. */
  trackOwnMessages?: boolean;
  capacity?: number;
}

const DEFAULT_CAPACITY = 500;
const MEDIA_LABEL: Record<MediaKind, string> = { image: "[gambar]", video: "[video]" };

/** Memberi tahu pemilik akun isi pesan yang ditarik (unsend) oleh orang lain. */
export class AntiUnsend {
  private settings: BotSettings = structuredClone(DEFAULT_SETTINGS);
  private readonly messages = new Map<string, Remembered>();
  private readonly capacity: number;

  constructor(private readonly deps: AntiUnsendDeps) {
    this.capacity = deps.capacity ?? DEFAULT_CAPACITY;
  }

  async init(): Promise<void> {
    this.settings = await this.deps.store.load();
  }

  get enabled(): boolean {
    return this.settings.antiUnsend.enabled;
  }

  /** Perintah `tab antiunsend [on | off]`. */
  async configure(args: string, message: ChatMessage): Promise<void> {
    const choice = args.toLowerCase();
    if (choice !== "on" && choice !== "off") {
      return message.reply(`Anti-unsend ${this.enabled ? "AKTIF" : "MATI"}. Pakai: tab antiunsend on / off`);
    }
    this.settings = { ...this.settings, antiUnsend: { enabled: choice === "on" } };
    await this.deps.store.save(this.settings);
    await message.reply(choice === "on" ? "✅ Anti-unsend diaktifkan." : "Anti-unsend dimatikan.");
  }

  remember(message: ChatMessage): void {
    if (message.isFromSelf && !this.deps.trackOwnMessages) return;

    this.messages.delete(message.id);
    this.messages.set(message.id, {
      senderId: message.senderId,
      isGroupChat: message.isGroupChat,
      text: message.text,
      mediaKind: message.mediaKind,
    });
    if (this.messages.size > this.capacity) {
      const oldest = this.messages.keys().next().value;
      if (oldest !== undefined) this.messages.delete(oldest);
    }
  }

  async onUnsent(messageId: string): Promise<void> {
    const remembered = this.messages.get(messageId);
    if (!remembered) return;
    this.messages.delete(messageId);
    if (!this.enabled) return;

    const sender = await this.deps.people.displayName(remembered.senderId);
    const content = remembered.text || (remembered.mediaKind ? MEDIA_LABEL[remembered.mediaKind] : "(pesan non-teks)");
    await this.deps.notifier.notify(
      `🗑️ Pesan ditarik\nDari: ${sender}\nDi: ${remembered.isGroupChat ? "grup" : "chat pribadi"}\nIsi: ${content}`,
    );
  }
}
