import type { ChatMessage } from "../domain/chat.ts";
import { DEFAULT_SETTINGS, type BotSettings, type FlexSender, type IdentityProvider, type SettingsStore } from "../domain/ports.ts";
import {
  buildCard,
  buildGallery,
  CARD_STYLES,
  CARD_THEMES,
  DEFAULT_STYLE,
  DEFAULT_THEME,
  sampleCard,
  type CardStyle,
  type CardThemeName,
} from "./flex-cards.ts";

export { buildCard, CARD_THEMES } from "./flex-cards.ts";

const LIFF_ID_PATTERN = /^\d{8,12}-[A-Za-z0-9]{6,12}$/;
const MAX_FLEX_JSON_LENGTH = 30_000;
const MAX_TITLE_LENGTH = 100;
const MAX_TEXT_LENGTH = 1000;
const MAX_BUTTON_LABEL_LENGTH = 20;
const MAX_CREDIT_LENGTH = 40;
const MAX_LABEL_LENGTH = 24;
const MAX_SUB_LENGTH = 100;
const MAX_GALLERY_IMAGES = 10;
const DEFAULT_PAUSE_MS = 1500;
const GIF_HINT =
  "ℹ️ Flex hanya menganimasikan APNG; GIF biasa tampil diam. Ubah GIF-mu jadi APNG yang berputar tanpa henti:\n" +
  "npx tsx scripts/gif-to-apng.ts <url-atau-file.gif>\nlalu unggah hasilnya ke tempat berlink https dan pakai URL-nya.";
/** Gambar contoh resmi dari CDN LINE, dipakai untuk pratinjau gaya. */
const SAMPLE_IMAGE_URL = "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png";
/** GIF contoh (Wikimedia Commons) untuk pratinjau gaya `latar`. */
const SAMPLE_GIF_URL = "https://upload.wikimedia.org/wikipedia/commons/2/2c/03_gif_animation_experimental_digital_photography_by_Rick_Doble.gif";

const STYLE_NAMES = Object.keys(CARD_STYLES) as CardStyle[];
const THEME_NAMES = Object.keys(CARD_THEMES) as CardThemeName[];

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);
const isHttpsUrl = (value: string) => /^https:\/\/\S+$/i.test(value);
const isStyle = (value: string): value is CardStyle => (STYLE_NAMES as string[]).includes(value);
const isTheme = (value: string): value is CardThemeName => (THEME_NAMES as string[]).includes(value);

const OPTION_PATTERN = /^(tema|gambar|latar|gif|gaya|oleh|label|sub|tombol2|rasio)\s*:\s*(.+)$/is;

/** Rasio gambar "lebar:tinggi" (Flex: tinggi maksimal 3x lebar). */
function parseRatio(value: string): string | null {
  const match = /^(\d{1,4}):(\d{1,4})$/.exec(value.trim());
  if (!match) return null;
  const [width, height] = [Number(match[1]), Number(match[2])];
  return width > 0 && height > 0 && height <= 3 * width ? `${width}:${height}` : null;
}

/** Pisahkan bagian bernilai `tema:` / `gambar:` / `gaya:` / `oleh:` / `label:` / `sub:` / `tombol2:` dari bagian posisi. */
function splitOptions(parts: string[]): { positional: string[]; options: Record<string, string> } {
  const options: Record<string, string> = {};
  const positional: string[] = [];
  for (const part of parts) {
    const match = OPTION_PATTERN.exec(part);
    if (match) options[match[1]!.toLowerCase()] = match[2]!.trim();
    else positional.push(part);
  }
  return { positional, options };
}

const FLEX_USAGE =
  "Pakai: tab flex <judul> | <isi> [| <label tombol> | <link https>] [| gaya:chino] [| tema:pink] [| gambar:https://...] " +
  "[| label:Teks] [| sub:Teks] [| oleh:Nama] [| rasio:16:9] [| tombol2:Label>https://...]\n" +
  `Gaya: ${STYLE_NAMES.join(", ")}\nTema: ${THEME_NAMES.join(", ")}\n` +
  'Baris isi berbentuk "Label: nilai" tampil sebagai dua kolom. Lihat contoh semua gaya: tab flexgaya contoh';

/**
 * Mengirim Flex Message lewat LIFF app yang diatur (`tab liff`): kartu bergaya (`tab flex`), JSON mentah (`tab flexjson`),
 * galeri gambar (`tab flexgaleri`), dan pengaturan gaya/tema bawaan beserta pratinjaunya (`tab flexgaya`).
 */
export class FlexService {
  private settings: BotSettings = structuredClone(DEFAULT_SETTINGS);

  constructor(
    private readonly deps: {
      sender: FlexSender;
      store: SettingsStore;
      /** Jeda antar kartu saat mengirim beberapa sekaligus (LINE membatasi kecepatan kirim), default 1,5 detik. */
      pauseMs?: number;
      /** Nama dan foto profil akun sendiri untuk bar bawah gaya `latar`. */
      identity?: IdentityProvider;
    },
  ) {}

  async init(): Promise<void> {
    this.settings = await this.deps.store.load();
  }

  private get defaultStyle(): CardStyle {
    return isStyle(this.settings.flex.style) ? this.settings.flex.style : DEFAULT_STYLE;
  }

  private get defaultTheme(): CardThemeName {
    return isTheme(this.settings.flex.theme) ? this.settings.flex.theme : DEFAULT_THEME;
  }

  /** Perintah `tab liff [id | reset]`. */
  async configureLiff(args: string, message: ChatMessage): Promise<void> {
    const value = args.trim();
    if (!value) {
      return message.reply(
        this.settings.liff.id
          ? `LIFF aktif: ${this.settings.liff.id}\nGanti: tab liff <id baru> · Hapus: tab liff reset`
          : "LIFF belum diatur. Pakai: tab liff <id LIFF>\nContoh format: 1234567890-AbCdEfGh (dari LINE Developers Console, scope chat_message.write).",
      );
    }
    if (value.toLowerCase() === "reset") {
      await this.save({ liff: { id: "" } });
      return message.reply("LIFF dihapus. Flex Message tidak bisa dikirim sampai diatur lagi.");
    }
    if (!LIFF_ID_PATTERN.test(value)) {
      return message.reply("Format id LIFF tidak valid. Contoh: 1234567890-AbCdEfGh");
    }
    await this.save({ liff: { id: value } });
    await message.reply(
      `✅ LIFF diatur: ${value}\n` +
        "Saat pertama kali dipakai, akunmu akan menyetujui izin LIFF app ini (kirim pesan). Pakai LIFF app milikmu sendiri, atau yang kamu percaya.",
    );
  }

  /** Perintah `tab flexgaya [gaya] [tema] | reset | contoh [gaya]`. */
  async configureStyle(args: string, message: ChatMessage): Promise<void> {
    const tokens = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const first = tokens[0];

    if (first === "contoh") return this.preview(tokens.slice(1), args, message);
    if (first === "oleh") return this.configureCredit(args.trim().slice(4).trim(), message);
    if (first === "reset") {
      await this.save({ flex: { ...DEFAULT_SETTINGS.flex } });
      return message.reply(`✅ Gaya dikembalikan ke bawaan: ${DEFAULT_STYLE} · tema ${DEFAULT_THEME}`);
    }
    if (tokens.length === 0) return message.reply(this.styleOverview());

    let { style, theme } = this.settings.flex;
    for (const token of tokens) {
      if (isStyle(token)) style = token;
      else if (isTheme(token)) theme = token;
      else return message.reply(`"${token}" bukan gaya atau tema.\n\n${this.styleOverview()}`);
    }
    await this.save({ flex: { ...this.settings.flex, style, theme } });
    await message.reply(`✅ Gaya bawaan: ${style} · tema: ${theme}\nCoba: tab flexgaya contoh ${style}`);
  }

  /** `tab flexgaya oleh [teks | reset]`: teks kredit di kiri bar bawah gaya `latar`. */
  private async configureCredit(value: string, message: ChatMessage): Promise<void> {
    if (!value) return message.reply(`Teks bar bawah gaya latar: "${this.settings.flex.credit}"\nGanti: tab flexgaya oleh <teks> · Kembalikan: tab flexgaya oleh reset`);
    if (value.length > MAX_CREDIT_LENGTH) return message.reply(`Teks maks. ${MAX_CREDIT_LENGTH} huruf.`);

    const credit = value.toLowerCase() === "reset" ? DEFAULT_SETTINGS.flex.credit : value;
    await this.save({ flex: { ...this.settings.flex, credit } });
    await message.reply(`✅ Teks bar bawah gaya latar: "${credit}"`);
  }

  /** Perintah `tab flex <judul> | <isi> [| <label tombol> | <link>] [| opsi...]`. */
  async sendCard(args: string, message: ChatMessage): Promise<void> {
    const { positional, options } = splitOptions(args.split("|").map((part) => part.trim()));
    const [title = "", text = "", buttonLabel, buttonUrl] = positional;

    if (!title || !text) return message.reply(FLEX_USAGE);
    if (title.length > MAX_TITLE_LENGTH || text.length > MAX_TEXT_LENGTH) {
      return message.reply(`Judul maks. ${MAX_TITLE_LENGTH} huruf dan isi maks. ${MAX_TEXT_LENGTH} huruf.`);
    }
    if (buttonLabel !== undefined || buttonUrl !== undefined) {
      if (!buttonLabel || !buttonUrl) return message.reply(`Tombol butuh label dan link sekaligus.\n${FLEX_USAGE}`);
      if (buttonLabel.length > MAX_BUTTON_LABEL_LENGTH) return message.reply(`Label tombol maks. ${MAX_BUTTON_LABEL_LENGTH} huruf.`);
      if (!isHttpUrl(buttonUrl)) return message.reply("Link tombol harus diawali http:// atau https://");
    }

    const theme = (options.tema ?? this.defaultTheme).toLowerCase();
    if (!isTheme(theme)) return message.reply(`Tema "${options.tema}" tidak ada. Pilihan: ${THEME_NAMES.join(", ")}`);
    const style = (options.gaya ?? this.defaultStyle).toLowerCase();
    if (!isStyle(style)) return message.reply(`Gaya "${options.gaya}" tidak ada. Pilihan: ${STYLE_NAMES.join(", ")}`);
    const imageUrl = options.gambar ?? options.latar ?? options.gif;
    if (imageUrl && !isHttpsUrl(imageUrl)) return message.reply("Link gambar/GIF harus diawali https://");
    if (options.oleh && options.oleh.length > MAX_CREDIT_LENGTH) return message.reply(`Teks "oleh" maks. ${MAX_CREDIT_LENGTH} huruf.`);
    if (options.label && options.label.length > MAX_LABEL_LENGTH) return message.reply(`Teks "label" maks. ${MAX_LABEL_LENGTH} huruf.`);
    if (options.sub && options.sub.length > MAX_SUB_LENGTH) return message.reply(`Teks "sub" maks. ${MAX_SUB_LENGTH} huruf.`);

    const ratio = options.rasio === undefined ? undefined : parseRatio(options.rasio);
    if (options.rasio !== undefined && !ratio) return message.reply("Format rasio: rasio:16:9 (lebar:tinggi, tinggi maks. 3x lebar).");

    let button2Label: string | undefined;
    let button2Url: string | undefined;
    if (options.tombol2) {
      const separator = options.tombol2.indexOf(">");
      button2Label = separator > 0 ? options.tombol2.slice(0, separator).trim() : "";
      button2Url = separator > 0 ? options.tombol2.slice(separator + 1).trim() : "";
      if (!button2Label || !button2Url || button2Label.length > MAX_BUTTON_LABEL_LENGTH || !isHttpUrl(button2Url)) {
        return message.reply("Format tombol kedua: tombol2:Label>https://link (label maks. 20 huruf)");
      }
    }

    const card = buildCard({
      title,
      text,
      buttonLabel,
      buttonUrl,
      button2Label,
      button2Url,
      theme,
      style,
      imageUrl,
      ratio: ratio ?? undefined,
      credit: options.oleh ?? (style === "latar" ? this.settings.flex.credit : undefined),
      label: options.label,
      sub: options.sub,
      author: style === "latar" ? await this.author() : undefined,
    });
    await this.send(message, title, card);
    if (style === "latar" && imageUrl && /\.gif(\?|#|$)/i.test(imageUrl)) await message.reply(GIF_HINT);
  }

  /** Perintah `tab flexjson <json>`: JSON bubble atau carousel mentah. */
  async sendJson(args: string, message: ChatMessage): Promise<void> {
    const raw = args.trim();
    if (!raw) return message.reply('Pakai: tab flexjson {"type":"bubble", ...}\nSusun JSON-nya di https://developers.line.biz/flex-simulator/');
    if (raw.length > MAX_FLEX_JSON_LENGTH) return message.reply(`JSON terlalu panjang (maks. ${MAX_FLEX_JSON_LENGTH} karakter).`);

    let contents: unknown;
    try {
      contents = JSON.parse(raw);
    } catch {
      return message.reply("JSON tidak valid. Periksa tanda kutip dan kurung.");
    }
    const type = (contents as { type?: unknown } | null)?.type;
    if (typeof contents !== "object" || contents === null || (type !== "bubble" && type !== "carousel")) {
      return message.reply('JSON harus berupa objek dengan "type": "bubble" atau "carousel".');
    }

    await this.send(message, "Flex Message", contents as Record<string, unknown>);
  }

  /** Perintah `tab flexgaleri <url> [| keterangan] [| <url> | keterangan ...]`: carousel gambar (maks. 10). */
  async sendGallery(args: string, message: ChatMessage): Promise<void> {
    const usage = "Pakai: tab flexgaleri https://gambar1.jpg | Keterangan 1 | https://gambar2.jpg | Keterangan 2\n(keterangan boleh dihilangkan; maks. 10 gambar, semua https)";
    const images: Array<{ url: string; caption?: string }> = [];

    for (const part of args.split(/[|\n]/).map((item) => item.trim()).filter(Boolean)) {
      const urls = part.split(/\s+/);
      if (urls.every(isHttpsUrl)) images.push(...urls.map((url) => ({ url })));
      else if (images.length > 0 && !images.at(-1)!.caption) images.at(-1)!.caption = part.slice(0, 60);
      else return message.reply(`Bagian "${part.slice(0, 40)}" bukan link gambar https.\n${usage}`);
    }
    if (images.length === 0) return message.reply(usage);
    if (images.length > MAX_GALLERY_IMAGES) return message.reply(`Maksimal ${MAX_GALLERY_IMAGES} gambar sekali kirim.`);

    await this.send(message, `Galeri (${images.length} gambar)`, buildGallery(images, this.defaultTheme));
  }

  private styleOverview(): string {
    const styles = STYLE_NAMES.map((name) => `${name === this.defaultStyle ? "▶" : "•"} ${name} — ${CARD_STYLES[name]}`).join("\n");
    return (
      `🎴 Gaya Flex bawaan: ${this.defaultStyle} · tema: ${this.defaultTheme}\n\n${styles}\n\n` +
      `Tema: ${THEME_NAMES.join(", ")}\n` +
      "Ganti: tab flexgaya <gaya> [tema] · Contoh: tab flexgaya contoh · Kembalikan: tab flexgaya reset\n" +
      `Teks bar bawah gaya latar: "${this.settings.flex.credit}" (ganti: tab flexgaya oleh <teks>)\n` +
      "Sekali pakai tanpa mengganti bawaan: tambah | gaya:bisnis | tema:biru pada tab flex."
    );
  }

  /** `tab flexgaya contoh [gaya] [gambar:https://...]`: kirim contoh kartu untuk satu atau semua gaya dengan tema bawaan. */
  private async preview(tokens: string[], rawArgs: string, message: ChatMessage): Promise<void> {
    const givenImage = /(?:gambar|latar|gif):(https:\/\/\S+)/i.exec(rawArgs)?.[1];
    const wanted = tokens.filter((token) => !/^(gambar|latar|gif):/.test(token));
    if (wanted.some((token) => !isStyle(token))) {
      return message.reply(`Gaya tidak dikenal. Pilihan: ${STYLE_NAMES.join(", ")}`);
    }
    const styles = wanted.length > 0 ? (wanted as CardStyle[]) : STYLE_NAMES;

    for (const [index, style] of styles.entries()) {
      if (index > 0) await this.pause();
      const imageUrl = givenImage ?? (style === "latar" ? SAMPLE_GIF_URL : SAMPLE_IMAGE_URL);
      const author = style === "latar" ? await this.author() : undefined;
      const credit = style === "latar" ? this.settings.flex.credit : undefined;
      const card = buildCard({ ...sampleCard(style, this.defaultTheme, imageUrl), ...(credit ? { credit } : {}), author });
      await this.send(message, `Contoh gaya ${style}`, card);
    }
  }

  /** Nama dan foto profil sendiri; gagal mengambil tidak membatalkan kirim (bar bawah dilewati). */
  private async author(): Promise<{ name: string; pictureUrl?: string } | undefined> {
    try {
      return await this.deps.identity?.current();
    } catch {
      return undefined;
    }
  }

  private pause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.deps.pauseMs ?? DEFAULT_PAUSE_MS));
  }

  private async send(message: ChatMessage, altText: string, contents: Record<string, unknown>): Promise<void> {
    const liffId = this.settings.liff.id;
    if (!liffId) {
      return message.reply("LIFF belum diatur, jadi Flex Message belum bisa dikirim.\nAtur dulu: tab liff <id LIFF>");
    }
    await this.deps.sender.send(message.chatId, liffId, altText, contents);
  }

  private async save(changes: Partial<BotSettings>): Promise<void> {
    this.settings = { ...this.settings, ...changes };
    await this.deps.store.save(this.settings);
  }
}
