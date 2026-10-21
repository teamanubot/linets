/**
 * Template kartu Flex. Setiap gaya adalah fungsi murni dari `CardInput` ke JSON Flex (bubble), jadi mudah diuji
 * dan ditambah. Warna mengikuti `tema` yang dipilih.
 */

/** Warna satu tema. `startColor`/`endColor`/`text`/`muted`/`accent` untuk latar gradien; `solid` untuk latar putih. */
interface CardTheme {
  startColor: string;
  endColor: string;
  text: string;
  muted: string;
  accent: string;
  /** Warna tegas yang terbaca di latar putih (tombol, label, judul). */
  solid: string;
}

/**
 * Tiga gradien pertama (pink, biru, senja) meniru palet repo talkouki89/chino-line-image-bot (MIT); sisanya melengkapi.
 */
export const CARD_THEMES = {
  pink: { startColor: "#FFAAD5", endColor: "#B15BFF", text: "#1F1235", muted: "#4A3A66", accent: "#5B21B6", solid: "#DB2777" },
  biru: { startColor: "#436EEE", endColor: "#66CDAA", text: "#0B1B3A", muted: "#1E3A5F", accent: "#0B3D91", solid: "#2563EB" },
  senja: { startColor: "#FFBD9D", endColor: "#9393FF", text: "#241A3D", muted: "#4B3F72", accent: "#4338CA", solid: "#6366F1" },
  hijau: { startColor: "#C3F0CA", endColor: "#5CC98A", text: "#0F2A1A", muted: "#2F5D43", accent: "#166534", solid: "#16A34A" },
  kuning: { startColor: "#FFE08A", endColor: "#FFB347", text: "#3A2A05", muted: "#6B4E12", accent: "#9A3412", solid: "#D97706" },
  merah: { startColor: "#FFB3B3", endColor: "#FF6B6B", text: "#3B0A0A", muted: "#6B1D1D", accent: "#991B1B", solid: "#DC2626" },
  ungu: { startColor: "#D8B4FE", endColor: "#7C3AED", text: "#1E0A3C", muted: "#3B2A66", accent: "#4C1D95", solid: "#7C3AED" },
  hitam: { startColor: "#4B5563", endColor: "#111827", text: "#F9FAFB", muted: "#D1D5DB", accent: "#93C5FD", solid: "#111827" },
} as const satisfies Record<string, CardTheme>;

export type CardThemeName = keyof typeof CARD_THEMES;
export const DEFAULT_THEME: CardThemeName = "pink";

/** Gaya yang tersedia beserta penjelasan singkat untuk `tab flexgaya`. */
export const CARD_STYLES = {
  chino: "gradien pastel ala Chino: gambar persegi, judul tengah, baris label/nilai",
  bisnis: "putih bersih: gambar lebar, label kecil, judul, rincian, dua tombol",
  banner: "teks di atas gambar lebar (atau gradien), cocok untuk promo",
  profil: "kartu identitas: avatar bulat, nama, rincian",
  struk: "daftar rincian rata kanan dengan baris total yang ditebalkan",
  pengumuman: "lencana berwarna, judul besar, isi, tombol",
  polos: "putih sederhana dengan tombol penuh",
  latar: "latar bergerak (APNG) memenuhi kartu: navbar judul, bar bawah teks kredit + foto profilmu",
} as const;

export type CardStyle = keyof typeof CARD_STYLES;
export const DEFAULT_STYLE: CardStyle = "chino";

export interface CardInput {
  title: string;
  text: string;
  buttonLabel?: string;
  buttonUrl?: string;
  button2Label?: string;
  button2Url?: string;
  theme?: CardThemeName;
  style?: CardStyle;
  /** Gambar (URL https): bentuk dan posisinya mengikuti gaya. */
  imageUrl?: string;
  /** Teks kecil di bagian bawah, mis. nama pembuat. */
  credit?: string;
  /** Label kecil di atas judul (huruf besar), mis. kategori. */
  label?: string;
  /** Subjudul di bawah judul. */
  sub?: string;
  /** Pengirim untuk bar tanda tangan (nama dan foto profil), dipakai gaya `latar`. */
  author?: { name: string; pictureUrl?: string };
}

type FlexNode = Record<string, unknown>;

const NEUTRAL = { text: "#111827", muted: "#6B7280", divider: "#E5E7EB", soft: "#F9FAFB" } as const;

/** Baris berbentuk "Label: nilai" (label pendek, ada spasi setelah titik dua) ditampilkan sebagai dua kolom. */
const ROW_PATTERN = /^([^:/\n]{1,16}):\s+(\S.*)$/;
const TOTAL_PATTERN = /^(total|grand total|jumlah|total bayar)$/i;

const textNode = (text: string, extra: FlexNode = {}): FlexNode => ({ type: "text", text, wrap: true, ...extra });
const box = (contents: FlexNode[], extra: FlexNode = {}): FlexNode => ({ type: "box", layout: "vertical", contents, ...extra });

interface Palette {
  text: string;
  muted: string;
  /** Warna untuk tautan/aksen pada latar ini. */
  accent: string;
}

const splitLines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

/** Dua kolom: label di kiri (abu-abu), nilai di kanan (rata kiri atau kanan). */
function infoRow(label: string, value: string, palette: Palette, options: { valueAlign?: "start" | "end"; emphasize?: boolean } = {}): FlexNode {
  const { valueAlign = "start", emphasize = false } = options;
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      textNode(label, { flex: 1, size: emphasize ? "md" : "sm", weight: emphasize ? "bold" : "regular", color: emphasize ? palette.text : palette.muted }),
      textNode(value, { flex: 2, size: emphasize ? "lg" : "sm", weight: emphasize ? "bold" : "regular", color: palette.text, align: valueAlign }),
    ],
  };
}

/** Isi kartu: tiap baris "Label: nilai" jadi dua kolom, selain itu teks biasa (satu kalimat saja dipusatkan bila `centerSingle`). */
function bodyLines(text: string, palette: Palette, options: { centerSingle?: boolean; valueAlign?: "start" | "end"; emphasizeTotal?: boolean } = {}): FlexNode[] {
  const { centerSingle = false, valueAlign = "start", emphasizeTotal = false } = options;
  const lines = splitLines(text);
  const allPlain = lines.length > 0 && lines.every((line) => !ROW_PATTERN.test(line));

  return lines.map((line) => {
    const row = ROW_PATTERN.exec(line);
    if (row) {
      const label = row[1]!.trim();
      return infoRow(label, row[2]!.trim(), palette, { valueAlign, emphasize: emphasizeTotal && TOTAL_PATTERN.test(label) });
    }
    return textNode(line, { size: "md", color: palette.text, lineSpacing: "6px", align: centerSingle && allPlain && lines.length === 1 ? "center" : "start" });
  });
}

const labelNode = (label: string, color: string): FlexNode => textNode(label.toUpperCase(), { size: "xs", weight: "bold", color });

function footerButtons({ buttonLabel, buttonUrl, button2Label, button2Url, credit }: CardInput, color: string, creditColor = NEUTRAL.muted): FlexNode | undefined {
  const contents: FlexNode[] = [];
  if (buttonLabel && buttonUrl) {
    contents.push({ type: "button", style: "primary", color, height: "sm", action: { type: "uri", label: buttonLabel, uri: buttonUrl } });
  }
  if (button2Label && button2Url) {
    contents.push({ type: "button", style: "secondary", height: "sm", action: { type: "uri", label: button2Label, uri: button2Url } });
  }
  if (credit) contents.push(textNode(credit, { size: "xs", align: "center", color: creditColor, margin: "md" }));
  return contents.length > 0 ? box(contents, { spacing: "sm", paddingAll: "16px" }) : undefined;
}

const whitePalette = (solid: string): Palette => ({ text: NEUTRAL.text, muted: NEUTRAL.muted, accent: solid });

// ---------------------------------------------------------------- gaya

/** Gradien pastel ala Chino: gambar persegi, judul tengah, pemisah, baris label/nilai, tautan, kredit kecil di kanan. */
function chinoCard(input: CardInput): FlexNode {
  const { title, text, buttonLabel, buttonUrl, imageUrl, credit, label, sub } = input;
  const theme = CARD_THEMES[input.theme ?? DEFAULT_THEME];
  const palette: Palette = { text: theme.text, muted: theme.muted, accent: theme.accent };
  const contents: FlexNode[] = [];

  if (imageUrl) {
    contents.push({
      type: "image",
      url: imageUrl,
      size: "full",
      aspectRatio: "1:1",
      aspectMode: "cover",
      ...(buttonUrl ? { action: { type: "uri", label: "buka", uri: buttonUrl } } : {}),
    });
  }
  if (label) contents.push(textNode(label.toUpperCase(), { size: "xs", weight: "bold", align: "center", color: theme.accent }));
  contents.push(textNode(title, { size: "xl", weight: "bold", align: "center", color: theme.text }));
  if (sub) contents.push(textNode(sub, { size: "sm", align: "center", color: theme.muted }));
  contents.push({ type: "separator", color: theme.muted }, box(bodyLines(text, palette, { centerSingle: true }), { spacing: "sm" }));
  if (buttonLabel && buttonUrl) {
    contents.push({ type: "separator", margin: "lg", color: theme.muted });
    contents.push({ type: "button", style: "link", color: theme.accent, height: "sm", action: { type: "uri", label: buttonLabel, uri: buttonUrl } });
  }
  if (credit) contents.push(textNode(credit, { size: "xs", align: "end", color: theme.muted }));

  return {
    type: "bubble",
    size: "kilo",
    body: box(contents, {
      spacing: "md",
      paddingAll: "18px",
      background: { type: "linearGradient", angle: "0deg", startColor: theme.startColor, endColor: theme.endColor },
    }),
  };
}

/** Putih bersih: gambar lebar di atas, label kecil, judul, subjudul, rincian, lalu footer dengan tombol utama dan kedua. */
function bisnisCard(input: CardInput): FlexNode {
  const { title, text, imageUrl, label, sub } = input;
  const { solid } = CARD_THEMES[input.theme ?? DEFAULT_THEME];
  const palette = whitePalette(solid);

  const header: FlexNode[] = [];
  if (label) header.push(labelNode(label, solid));
  header.push(textNode(title, { size: "xl", weight: "bold", color: NEUTRAL.text }));
  if (sub) header.push(textNode(sub, { size: "sm", color: NEUTRAL.muted }));

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: box(
      [...header, { type: "separator", margin: "md", color: NEUTRAL.divider }, box(bodyLines(text, palette), { spacing: "sm", margin: "md" })],
      { paddingAll: "20px", spacing: "xs" },
    ),
    styles: { body: { backgroundColor: "#FFFFFF" }, footer: { backgroundColor: NEUTRAL.soft, separator: true, separatorColor: NEUTRAL.divider } },
  };
  if (imageUrl) bubble.hero = { type: "image", url: imageUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover" };
  const footer = footerButtons(input, solid);
  if (footer) bubble.footer = footer;
  return bubble;
}

/** Banner: judul di atas gambar lebar (lapisan gelap transparan) atau di atas gradien bila tanpa gambar; rincian di bawahnya. */
function bannerCard(input: CardInput): FlexNode {
  const { title, text, imageUrl, label, sub } = input;
  const theme = CARD_THEMES[input.theme ?? DEFAULT_THEME];
  const onImage = Boolean(imageUrl);
  const titleColor = onImage ? "#FFFFFF" : theme.text;
  const subColor = onImage ? "#E5E7EB" : theme.muted;

  const headline: FlexNode[] = [];
  if (label) headline.push(labelNode(label, onImage ? "#FDE68A" : theme.accent));
  headline.push(textNode(title, { size: "xl", weight: "bold", color: titleColor }));
  if (sub) headline.push(textNode(sub, { size: "sm", color: subColor }));

  const media = imageUrl
    ? box(
        [
          { type: "image", url: imageUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
          box(headline, { position: "absolute", offsetBottom: "0px", offsetStart: "0px", offsetEnd: "0px", paddingAll: "16px", spacing: "xs", backgroundColor: "#000000B3" }),
        ],
      )
    : box(headline, {
        height: "170px",
        justifyContent: "flex-end",
        paddingAll: "20px",
        spacing: "xs",
        background: { type: "linearGradient", angle: "0deg", startColor: theme.startColor, endColor: theme.endColor },
      });

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: box([media, box(bodyLines(text, whitePalette(theme.solid)), { paddingAll: "20px", spacing: "sm" })], { paddingAll: "0px" }),
    styles: { body: { backgroundColor: "#FFFFFF" }, footer: { backgroundColor: NEUTRAL.soft, separator: true, separatorColor: NEUTRAL.divider } },
  };
  const footer = footerButtons(input, theme.solid);
  if (footer) bubble.footer = footer;
  return bubble;
}

/** Profil: header gradien dengan avatar bulat (gambar, atau inisial) dan nama; rincian di bawahnya. */
function profilCard(input: CardInput): FlexNode {
  const { title, text, imageUrl, label, sub } = input;
  const theme = CARD_THEMES[input.theme ?? DEFAULT_THEME];
  // LINE menolak cornerRadius pada image (INVALID_MESSAGE), jadi avatar bulat dibuat dengan membungkus gambar dalam box berujung bulat.
  const avatar: FlexNode = imageUrl
    ? box([{ type: "image", url: imageUrl, size: "full", aspectRatio: "1:1", aspectMode: "cover" }], {
        width: "72px",
        height: "72px",
        cornerRadius: "100px",
        flex: 0,
      })
    : box([textNode(title.trim().charAt(0).toUpperCase() || "?", { size: "xxl", weight: "bold", align: "center", color: theme.text })], {
        width: "72px",
        height: "72px",
        cornerRadius: "100px",
        backgroundColor: "#FFFFFF80",
        justifyContent: "center",
        flex: 0,
      });

  const identity: FlexNode[] = [];
  if (label) identity.push(labelNode(label, theme.accent));
  identity.push(textNode(title, { size: "xl", weight: "bold", color: theme.text }));
  if (sub) identity.push(textNode(sub, { size: "sm", color: theme.muted }));

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    header: box([{ type: "box", layout: "horizontal", spacing: "lg", alignItems: "center", contents: [avatar, box(identity, { spacing: "xs", justifyContent: "center" })] }], {
      paddingAll: "20px",
      background: { type: "linearGradient", angle: "0deg", startColor: theme.startColor, endColor: theme.endColor },
    }),
    body: box(bodyLines(text, whitePalette(theme.solid)), { paddingAll: "20px", spacing: "sm" }),
    styles: { body: { backgroundColor: "#FFFFFF" }, footer: { backgroundColor: NEUTRAL.soft, separator: true, separatorColor: NEUTRAL.divider } },
  };
  const footer = footerButtons(input, theme.solid);
  if (footer) bubble.footer = footer;
  return bubble;
}

/** Struk: rincian dengan nilai rata kanan; baris Total/Jumlah ditebalkan dan diberi garis di atasnya. */
function strukCard(input: CardInput): FlexNode {
  const { title, text, imageUrl, label, sub } = input;
  const { solid } = CARD_THEMES[input.theme ?? DEFAULT_THEME];
  const palette = whitePalette(solid);

  const rows = bodyLines(text, palette, { valueAlign: "end", emphasizeTotal: true }).flatMap((row) => {
    const label = ((row.contents as FlexNode[] | undefined)?.[0]?.text as string | undefined) ?? "";
    return TOTAL_PATTERN.test(label) ? [{ type: "separator", margin: "md", color: NEUTRAL.divider } as FlexNode, row] : [row];
  });

  const header: FlexNode[] = [];
  if (label) header.push(labelNode(label, solid));
  header.push(textNode(title, { size: "lg", weight: "bold", color: NEUTRAL.text }));
  if (sub) header.push(textNode(sub, { size: "xs", color: NEUTRAL.muted }));

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: box([...header, { type: "separator", margin: "md", color: NEUTRAL.divider }, box(rows, { spacing: "sm", margin: "md" })], { paddingAll: "20px", spacing: "xs" }),
    styles: { body: { backgroundColor: "#FFFFFF" }, footer: { backgroundColor: NEUTRAL.soft, separator: true, separatorColor: NEUTRAL.divider } },
  };
  if (imageUrl) bubble.hero = { type: "image", url: imageUrl, size: "full", aspectRatio: "20:9", aspectMode: "cover" };
  const footer = footerButtons(input, solid);
  if (footer) bubble.footer = footer;
  return bubble;
}

/** Pengumuman: lencana berwarna (label), judul besar, subjudul, isi, tombol; gambar opsional di atas. */
function pengumumanCard(input: CardInput): FlexNode {
  const { title, text, imageUrl, label, sub } = input;
  const { solid } = CARD_THEMES[input.theme ?? DEFAULT_THEME];

  const content: FlexNode[] = [];
  if (label) {
    content.push({
      type: "box",
      layout: "horizontal",
      contents: [
        box([textNode(label.toUpperCase(), { size: "xs", weight: "bold", color: "#FFFFFF" })], {
          flex: 0,
          backgroundColor: solid,
          cornerRadius: "20px",
          paddingTop: "4px",
          paddingBottom: "4px",
          paddingStart: "12px",
          paddingEnd: "12px",
        }),
        { type: "filler" },
      ],
    });
  }
  content.push(textNode(title, { size: "xxl", weight: "bold", color: NEUTRAL.text, margin: "md" }));
  if (sub) content.push(textNode(sub, { size: "sm", color: NEUTRAL.muted }));
  content.push(...bodyLines(text, whitePalette(solid)).map((line) => ({ ...line, margin: "md" })));

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: box(content, { paddingAll: "22px", spacing: "xs" }),
    styles: { body: { backgroundColor: "#FFFFFF" }, footer: { backgroundColor: "#FFFFFF" } },
  };
  if (imageUrl) bubble.hero = { type: "image", url: imageUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover" };
  const footer = footerButtons(input, solid);
  if (footer) bubble.footer = footer;
  return bubble;
}

/** Putih sederhana: judul berwarna, garis, isi, tombol penuh. */
function polosCard(input: CardInput): FlexNode {
  const { title, text, imageUrl, label, sub } = input;
  const { solid } = CARD_THEMES[input.theme ?? DEFAULT_THEME];

  const content: FlexNode[] = [];
  if (label) content.push(labelNode(label, solid));
  content.push(textNode(title, { weight: "bold", size: "xl", color: solid }));
  if (sub) content.push(textNode(sub, { size: "sm", color: NEUTRAL.muted }));
  content.push({ type: "separator", color: solid }, ...bodyLines(text, whitePalette(solid)));

  const bubble: FlexNode = { type: "bubble", size: "mega", body: box(content, { paddingAll: "xl", spacing: "lg" }) };
  if (imageUrl) bubble.hero = { type: "image", url: imageUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover" };
  const footer = footerButtons(input, solid);
  if (footer) bubble.footer = footer;
  return bubble;
}

/** Lingkaran foto profil (gambar dibungkus box berujung bulat), atau inisial nama bila tidak ada foto. */
function avatarCircle(name: string, pictureUrl: string | undefined, size: string, colors: { background: string; text: string }): FlexNode {
  const radius = `${Math.round(Number.parseInt(size, 10) / 2)}px`;
  if (pictureUrl) {
    return box([{ type: "image", url: pictureUrl, size: "full", aspectRatio: "1:1", aspectMode: "cover" }], { width: size, height: size, cornerRadius: radius, flex: 0 });
  }
  return box([textNode(name.trim().charAt(0).toUpperCase() || "?", { size: "md", weight: "bold", align: "center", color: colors.text })], {
    width: size,
    height: size,
    cornerRadius: radius,
    backgroundColor: colors.background,
    justifyContent: "center",
    flex: 0,
  });
}

/** Isi di tengah: setiap baris jadi teks rata tengah (baris "Label: nilai" ditulis apa adanya). */
function centeredLines(text: string, color: string): FlexNode[] {
  return splitLines(text).map((line) => textNode(line, { size: "lg", weight: "bold", align: "center", color, lineSpacing: "6px" }));
}

/**
 * Latar bergerak: navbar solid di atas berisi judul, gambar (APNG bergerak) memenuhi seluruh area tengah dengan isi teks di
 * tengahnya, dan bar bawah gelap berisi teks kredit di kiri dan foto profil pengirim di kanan. Isi `-` berarti tanpa teks
 * (gambar saja). Tanpa gambar, area tengah memakai gradien tema.
 */
function latarCard(input: CardInput): FlexNode {
  const { title, text, imageUrl, label, sub, author, credit, buttonLabel, buttonUrl } = input;
  const theme = CARD_THEMES[input.theme ?? DEFAULT_THEME];
  const onNavbar = { strong: "#FFFFFF", soft: "#FFFFFFCC" };
  const body = text.trim() === "-" ? "" : text;

  const navbar: FlexNode[] = [];
  if (label) navbar.push(textNode(label.toUpperCase(), { size: "xs", weight: "bold", align: "center", color: onNavbar.soft }));
  navbar.push(textNode(title, { size: "lg", weight: "bold", align: "center", color: onNavbar.strong }));
  if (sub) navbar.push(textNode(sub, { size: "xs", align: "center", color: onNavbar.soft }));

  const stage = imageUrl
    ? box([
        { type: "image", url: imageUrl, size: "full", aspectRatio: "1:1", aspectMode: "cover", animated: true },
        ...(body
          ? [
              box(centeredLines(body, "#FFFFFF"), {
                position: "absolute",
                offsetTop: "0px",
                offsetBottom: "0px",
                offsetStart: "0px",
                offsetEnd: "0px",
                justifyContent: "center",
                alignItems: "center",
                paddingAll: "24px",
                spacing: "sm",
                backgroundColor: "#00000055",
              }),
            ]
          : []),
      ])
    : box(centeredLines(body || title, theme.text), {
        height: "280px",
        justifyContent: "center",
        alignItems: "center",
        paddingAll: "24px",
        spacing: "sm",
        background: { type: "linearGradient", angle: "0deg", startColor: theme.startColor, endColor: theme.endColor },
      });

  const footerContents: FlexNode[] = [];
  if (buttonLabel && buttonUrl) {
    footerContents.push({ type: "button", style: "link", color: "#93C5FD", height: "sm", action: { type: "uri", label: buttonLabel, uri: buttonUrl } });
  }
  if (credit || author) {
    footerContents.push({
      type: "box",
      layout: "horizontal",
      spacing: "md",
      alignItems: "center",
      contents: [
        textNode(credit ?? " ", { size: "xs", weight: "bold", color: "#D1D5DB", flex: 1, gravity: "center" }),
        ...(author ? [avatarCircle(author.name, author.pictureUrl, "36px", { background: "#FFFFFF33", text: "#FFFFFF" })] : []),
      ],
    });
  }

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    header: box(navbar, { paddingAll: "14px", spacing: "xs", backgroundColor: theme.solid }),
    body: box([stage], { paddingAll: "0px" }),
    styles: { footer: { backgroundColor: "#111827" } },
  };
  if (footerContents.length > 0) bubble.footer = box(footerContents, { paddingAll: "12px", spacing: "sm" });
  return bubble;
}

const BUILDERS: Record<CardStyle, (input: CardInput) => FlexNode> = {
  chino: chinoCard,
  bisnis: bisnisCard,
  banner: bannerCard,
  profil: profilCard,
  struk: strukCard,
  pengumuman: pengumumanCard,
  polos: polosCard,
  latar: latarCard,
};

export function buildCard(input: CardInput): FlexNode {
  return BUILDERS[input.style ?? DEFAULT_STYLE](input);
}

/** Galeri: carousel gambar persegi dengan keterangan opsional per gambar (maks. 10). */
export function buildGallery(images: Array<{ url: string; caption?: string }>, theme: CardThemeName = DEFAULT_THEME): FlexNode {
  const { startColor, endColor, text } = CARD_THEMES[theme];
  return {
    type: "carousel",
    contents: images.slice(0, 10).map(({ url, caption }) => ({
      type: "bubble",
      size: "kilo",
      body: box(
        [
          { type: "image", url, size: "full", aspectRatio: "1:1", aspectMode: "cover", action: { type: "uri", label: "buka", uri: url } },
          ...(caption ? [box([textNode(caption, { size: "sm", align: "center", color: text })], { paddingAll: "12px" })] : []),
        ],
        {
          paddingAll: "0px",
          ...(caption ? { background: { type: "linearGradient", angle: "0deg", startColor, endColor } } : {}),
        },
      ),
    })),
  };
}

/** Contoh isi untuk pratinjau tiap gaya (`tab flexgaya contoh`). */
export function sampleCard(style: CardStyle, theme: CardThemeName, imageUrl?: string): CardInput {
  const base = { style, theme, buttonLabel: "Lihat Detail", buttonUrl: "https://line.me", credit: "Contoh gaya" } as const;
  switch (style) {
    case "profil":
      return { ...base, title: "Rmun Bot", sub: "Asisten LINE", label: "Profil", text: "Peran: Self-bot\nStatus: Aktif\nBergabung: Oktober 2026", imageUrl };
    case "struk":
      return { ...base, title: "Pesanan #20261021", sub: "21 Okt 2026 · 14.32", label: "Struk", text: "Kopi susu: Rp 25.000\nRoti bakar: Rp 18.000\nOngkir: Rp 7.000\nTotal: Rp 50.000", imageUrl };
    case "pengumuman":
      return { ...base, title: "Rapat Tim Dimajukan", sub: "Senin, 09.00 WIB", label: "Penting", text: "Mohon hadir tepat waktu dan siapkan laporan mingguan.", imageUrl };
    case "banner":
      return { ...base, title: "Promo Akhir Pekan", sub: "Diskon sampai 50%", label: "Spesial", text: "Berlaku: Sabtu–Minggu\nMinimal belanja: Rp 100.000", imageUrl };
    case "bisnis":
      return { ...base, title: "Paket Premium", sub: "Langganan bulanan", label: "Penawaran", text: "Harga: Rp 99.000\nMasa aktif: 30 hari\nDukungan: 24 jam", button2Label: "Pelajari", button2Url: "https://line.me", imageUrl };
    case "polos":
      return { ...base, title: "Halo Dunia", label: "Info", text: "Ini kartu bergaya polos dengan tombol penuh.", imageUrl };
    case "latar":
      return { ...base, title: "Selamat Pagi", sub: "Semoga harimu menyenangkan", label: "Sapaan", text: "Semangat terus ya ✨\nJangan lupa minum air", imageUrl, credit: "Powered By TeamAnuBot" };
    default:
      return { ...base, title: "Selamat Datang", sub: "Terima kasih sudah bergabung", label: "Info", text: "Nama: Rmun\nPaket: Premium\nBerlaku: 30 hari", imageUrl };
  }
}
