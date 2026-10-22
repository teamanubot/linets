import type { ChatMessage } from "../domain/chat.ts";
import type { SearchProvider, SearchResultItem } from "../domain/ports.ts";

export type SearchPlatform = "youtube" | "tiktok";

const PLATFORM_LABEL: Record<SearchPlatform, string> = { youtube: "YouTube", tiktok: "TikTok" };
const DL_COMMAND: Record<SearchPlatform, string> = { youtube: "dl-yt", tiktok: "dl-tiktok" };

const PAGE_SIZE = 10;
/** Batas total hasil yang diambil per pencarian, agar "lanjut" berulang-ulang tidak membebani platformnya. */
const MAX_RESULTS = 50;
/** Sesi pencarian yang tidak disentuh selama ini dianggap basi (supaya map tidak membesar tanpa batas). */
const SESSION_TTL_MS = 15 * 60_000;

interface SearchSession {
  platform: SearchPlatform;
  query: string;
  items: SearchResultItem[];
  shown: number;
  /** True kalau platform sudah tidak bisa memberi hasil lebih banyak dari yang sudah diambil. */
  exhausted: boolean;
  updatedAt: number;
}

function formatItem(index: number, item: SearchResultItem): string {
  const author = item.author ? ` — ${item.author}` : "";
  const extra = item.extra ? ` (${item.extra})` : "";
  return `${index}. ${item.title}${author}${extra}`;
}

export interface MediaSearchDeps {
  providers: Partial<Record<SearchPlatform, SearchProvider>>;
}

/**
 * `tab search-yt|search-tiktok <kata kunci>`: cari 10 hasil teratas. `tab lanjut`: 10 hasil berikutnya dari
 * pencarian terakhir di chat ini. `tab pilih <nomor>`: detail (judul/caption + pembuat + link) satu hasil,
 * siap ditempel ke perintah dl-* platform yang sesuai untuk diunduh.
 */
export class MediaSearch {
  private readonly sessions = new Map<string, SearchSession>();

  constructor(private readonly deps: MediaSearchDeps) {}

  async search(platform: SearchPlatform, query: string, message: ChatMessage): Promise<void> {
    const platformName = PLATFORM_LABEL[platform];
    const provider = this.deps.providers[platform];
    if (!provider) {
      return message.reply(`Pencarian ${platformName} belum didukung.`);
    }

    const trimmed = query.trim();
    if (!trimmed) return message.reply(`Pakai: tab search-${platform === "youtube" ? "yt" : "tiktok"} <kata kunci>`);

    await message.reply(`🔎 Mencari "${trimmed}" di ${platformName}...`);
    let items: SearchResultItem[];
    try {
      items = await provider.search(trimmed, PAGE_SIZE);
    } catch (error) {
      return message.reply(`Gagal mencari: ${(error as Error).message}`);
    }
    if (items.length === 0) return message.reply(`Tidak ada hasil untuk "${trimmed}" di ${platformName}.`);

    const shown = Math.min(PAGE_SIZE, items.length);
    this.sessions.set(message.chatId, { platform, query: trimmed, items, shown, exhausted: items.length < PAGE_SIZE, updatedAt: Date.now() });
    await this.renderPage(message, platformName, trimmed, 0, shown);
  }

  async next(message: ChatMessage): Promise<void> {
    const session = this.activeSession(message.chatId);
    if (!session) return message.reply('Belum ada pencarian aktif. Pakai "tab search-yt <kata kunci>" atau "tab search-tiktok <kata kunci>" dulu.');

    const platformName = PLATFORM_LABEL[session.platform];
    const atCap = session.items.length >= MAX_RESULTS;
    if (session.shown >= session.items.length && (session.exhausted || atCap)) {
      return message.reply(`Sudah semua (${session.items.length} hasil) untuk "${session.query}" di ${platformName}.`);
    }

    const need = Math.min(session.shown + PAGE_SIZE, MAX_RESULTS);
    if (need > session.items.length && !session.exhausted) {
      const provider = this.deps.providers[session.platform]!;
      try {
        const items = await provider.search(session.query, need);
        session.exhausted = items.length < need || items.length <= session.items.length || items.length >= MAX_RESULTS;
        session.items = items;
      } catch (error) {
        return message.reply(`Gagal mengambil hasil berikutnya: ${(error as Error).message}`);
      }
    }

    if (session.shown >= session.items.length) {
      return message.reply(`Tidak ada hasil lagi (total ${session.items.length}) untuk "${session.query}" di ${platformName}.`);
    }

    const from = session.shown;
    const shown = Math.min(session.items.length, session.shown + PAGE_SIZE);
    session.shown = shown;
    session.updatedAt = Date.now();
    await this.renderPage(message, platformName, session.query, from, shown);
  }

  async pick(args: string, message: ChatMessage): Promise<void> {
    const session = this.activeSession(message.chatId);
    if (!session) return message.reply('Belum ada pencarian aktif. Pakai "tab search-yt <kata kunci>" atau "tab search-tiktok <kata kunci>" dulu.');

    const n = Number(args.trim());
    if (!Number.isInteger(n) || n < 1) return message.reply("Pakai: tab pilih <nomor>");
    if (n > session.items.length) {
      return message.reply(`Baru ada ${session.items.length} hasil yang diambil. Ketik "tab lanjut" dulu untuk mengambil lebih banyak.`);
    }

    const item = session.items[n - 1]!;
    await message.reply(
      `${item.title}\n` +
        (item.author ? `Oleh: ${item.author}\n` : "") +
        (item.extra ? `${item.extra}\n` : "") +
        `🔗 ${item.link}\n\n` +
        `Unduh: tab ${DL_COMMAND[session.platform]} ${item.link}`,
    );
  }

  private activeSession(chatId: string): SearchSession | null {
    const session = this.sessions.get(chatId);
    if (!session) return null;
    if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
      this.sessions.delete(chatId);
      return null;
    }
    return session;
  }

  private async renderPage(message: ChatMessage, platformName: string, query: string, from: number, shown: number): Promise<void> {
    const session = this.sessions.get(message.chatId)!;
    const lines = session.items.slice(from, shown).map((item, i) => formatItem(from + i + 1, item));
    const hasMore = shown < MAX_RESULTS && (!session.exhausted || shown < session.items.length);
    const hint = hasMore ? `\n\nKetik "tab lanjut" untuk hasil berikutnya, "tab pilih <nomor>" untuk detail + link.` : `\n\nKetik "tab pilih <nomor>" untuk detail + link.`;
    await message.reply(`Hasil ${platformName} untuk "${query}" (${from + 1}-${shown}):\n${lines.join("\n")}${hint}`);
  }
}
