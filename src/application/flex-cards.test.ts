import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCard, buildGallery, CARD_STYLES, CARD_THEMES, DEFAULT_THEME, sampleCard, type CardStyle, type CardThemeName } from "./flex-cards.ts";

type Node = Record<string, any>;

const bodyOf = (card: Node) => card.body as Node;
const typesOf = (box: Node) => (box.contents as Node[]).map((item) => item.type);

describe("kartu gaya Chino", () => {
  it("struktur: bubble kilo, latar gradien, judul tengah, pemisah, isi", () => {
    const card = buildCard({ title: "Halo", text: "Isi pesan" });
    const body = bodyOf(card);

    assert.equal(card.type, "bubble");
    assert.equal(card.size, "kilo");
    assert.equal(body.background.type, "linearGradient");
    assert.equal(body.background.startColor, CARD_THEMES[DEFAULT_THEME].startColor);
    assert.equal(body.background.endColor, CARD_THEMES[DEFAULT_THEME].endColor);
    assert.deepEqual(typesOf(body), ["text", "separator", "box"]);
    assert.deepEqual({ weight: body.contents[0].weight, align: body.contents[0].align, size: body.contents[0].size }, { weight: "bold", align: "center", size: "xl" });
  });

  it("isi satu baris biasa ditampilkan di tengah", () => {
    const body = bodyOf(buildCard({ title: "T", text: "Satu kalimat saja" }));
    const [line] = body.contents[2].contents as Node[];
    assert.equal(line!.type, "text");
    assert.equal(line!.align, "center");
  });

  it("baris 'Label: nilai' jadi dua kolom (label flex 1, nilai flex 2), URL tidak disalahartikan", () => {
    const card = buildCard({ title: "T", text: "Harga: Rp 25.000\nStok: 12\nLihat https://contoh.id/a" });
    const rows = bodyOf(card).contents[2].contents as Node[];

    assert.equal(rows.length, 3);
    assert.equal(rows[0]!.layout, "horizontal");
    assert.deepEqual(rows[0]!.contents.map((item: Node) => [item.text, item.flex]), [["Harga", 1], ["Rp 25.000", 2]]);
    assert.equal(rows[1]!.contents[0].text, "Stok");
    assert.equal(rows[2]!.type, "text"); // "https://" bukan label
    assert.equal(rows[2]!.text, "Lihat https://contoh.id/a");
  });

  it("gambar persegi di atas (dengan aksi ke link tombol), tombol bergaya tautan, kredit kecil di kanan", () => {
    const card = buildCard({ title: "T", text: "I", imageUrl: "https://a.id/x.png", buttonLabel: "Buka", buttonUrl: "https://line.me", credit: "Rmun", theme: "biru" });
    const items = bodyOf(card).contents as Node[];

    assert.equal(items[0]!.type, "image");
    assert.deepEqual({ ratio: items[0]!.aspectRatio, mode: items[0]!.aspectMode, uri: items[0]!.action.uri }, { ratio: "1:1", mode: "cover", uri: "https://line.me" });
    const button = items.find((item) => item.type === "button")!;
    assert.deepEqual({ style: button.style, color: button.color, label: button.action.label }, { style: "link", color: CARD_THEMES.biru.accent, label: "Buka" });
    const credit = items.at(-1)!;
    assert.deepEqual({ text: credit.text, align: credit.align, size: credit.size }, { text: "Rmun", align: "end", size: "xs" });
  });

  it("tanpa tombol dan kredit: tidak ada tombol maupun teks kredit", () => {
    const items = bodyOf(buildCard({ title: "T", text: "I" })).contents as Node[];
    assert.equal(items.some((item) => item.type === "button"), false);
    assert.equal(items.length, 3);
  });

  it("tema gelap memakai teks terang", () => {
    const card = buildCard({ title: "T", text: "I", theme: "hitam" });
    assert.equal(bodyOf(card).contents[0].color, CARD_THEMES.hitam.text);
    assert.equal(CARD_THEMES.hitam.text, "#F9FAFB");
  });
});

describe("kartu gaya polos", () => {
  it("bubble mega putih tanpa gradien, tombol penuh dan hero gambar", () => {
    const card: Node = buildCard({ title: "T", text: "I", style: "polos", buttonLabel: "Klaim", buttonUrl: "https://line.me", imageUrl: "https://a.id/x.png" });

    assert.equal(card.size, "mega");
    assert.equal("background" in bodyOf(card), false);
    assert.equal(card.hero.aspectRatio, "20:13");
    assert.equal(card.footer.contents[0].style, "primary");
  });
});

/** Semua node box tidak boleh kosong dan seluruh JSON harus bisa dibulatkan lewat JSON (tanpa undefined). */
function assertWellFormed(value: unknown, path = "kartu"): void {
  if (Array.isArray(value)) return value.forEach((item, i) => assertWellFormed(item, `${path}[${i}]`));
  if (typeof value !== "object" || value === null) return;
  const node = value as Node;
  assert.ok(!Object.values(node).includes(undefined), `${path} mengandung undefined`);
  if (node.type === "box") assert.ok(Array.isArray(node.contents) && node.contents.length > 0, `${path}: box kosong`);
  if (node.type === "text") assert.ok(typeof node.text === "string" && node.text.length > 0, `${path}: teks kosong`);
  for (const [key, child] of Object.entries(node)) assertWellFormed(child, `${path}.${key}`);
}

describe("semua gaya", () => {
  const full = { title: "Judul Kartu", text: "Harga: Rp 25.000\nStok: 12\nTotal: Rp 50.000\nCatatan satu baris", label: "Promo", sub: "Subjudul", credit: "Rmun", buttonLabel: "Buka", buttonUrl: "https://line.me", button2Label: "Lagi", button2Url: "https://line.me/2", imageUrl: "https://a.id/x.png" } as const;
  const styles = Object.keys(CARD_STYLES) as CardStyle[];
  const themes = Object.keys(CARD_THEMES) as CardThemeName[];

  it("setiap gaya x tema menghasilkan bubble yang rapi, dan muat di batas Flex", () => {
    for (const style of styles) {
      for (const theme of themes) {
        for (const input of [full, { title: "Hanya Judul", text: "Satu kalimat." }]) {
          const card = buildCard({ ...input, style, theme });
          assert.equal(card.type, "bubble", `${style}/${theme}`);
          assertWellFormed(card, `${style}/${theme}`);
          assert.ok(JSON.stringify(card).length < 10_000, `${style}/${theme} terlalu besar`);
        }
      }
    }
  });

  it("setiap gaya memakai semua masukan penting: judul, isi, tombol, gambar, label", () => {
    for (const style of styles) {
      const json = JSON.stringify(buildCard({ ...full, style }));
      for (const needle of ["Judul Kartu", "Rp 25.000", "https://line.me", "https://a.id/x.png", style === "chino" ? "PROMO" : "PROMO"]) {
        assert.ok(json.includes(needle), `${style} kehilangan ${needle}`);
      }
    }
  });

  it("tidak ada properti yang diketahui ditolak LINE: image tidak punya cornerRadius", () => {
    for (const style of styles) {
      assert.doesNotMatch(JSON.stringify(buildCard({ ...full, style })), /"type":"image"[^}]*"cornerRadius"/, style);
    }
  });

  it("contoh bawaan setiap gaya valid", () => {
    for (const style of styles) {
      const card = buildCard(sampleCard(style, "biru", "https://a.id/x.png"));
      assertWellFormed(card, `contoh ${style}`);
      assert.equal(card.type, "bubble");
    }
  });

  it("gaya-gaya tampil berbeda secara struktur", () => {
    const shapes = new Set(styles.map((style) => JSON.stringify(Object.keys(buildCard({ ...full, style })).sort()) + (buildCard({ ...full, style }).size as string)));
    assert.ok(shapes.size >= 4, `terlalu mirip: ${shapes.size}`);
  });
});

describe("gaya bisnis", () => {
  it("hero gambar lebar, label huruf besar, judul, dua tombol (utama + kedua) dan kredit di footer", () => {
    const card: Node = buildCard({ title: "Paket", text: "Harga: Rp 99.000", style: "bisnis", label: "Penawaran", imageUrl: "https://a.id/x.png", buttonLabel: "Beli", buttonUrl: "https://a.id", button2Label: "Info", button2Url: "https://b.id", credit: "Rmun", theme: "biru" });

    assert.equal(card.hero.aspectRatio, "20:13");
    assert.equal(card.body.contents[0].text, "PENAWARAN");
    assert.equal(card.body.contents[1].text, "Paket");
    assert.deepEqual(card.footer.contents.map((item: Node) => item.style ?? item.type), ["primary", "secondary", "text"]);
    assert.equal(card.footer.contents[0].color, CARD_THEMES.biru.solid);
  });
});

describe("gaya banner", () => {
  it("dengan gambar: lapisan gelap transparan di atas gambar memuat judul", () => {
    const card: Node = buildCard({ title: "Promo", text: "I", style: "banner", imageUrl: "https://a.id/x.png", label: "Spesial" });
    const media = card.body.contents[0];
    const overlay = media.contents[1];

    assert.equal(media.contents[0].type, "image");
    assert.equal(overlay.position, "absolute");
    assert.match(overlay.backgroundColor, /^#[0-9A-F]{6}[0-9A-F]{2}$/i);
    assert.equal(overlay.contents.find((item: Node) => item.text === "Promo").color, "#FFFFFF");
  });

  it("tanpa gambar: judul di atas blok gradien", () => {
    const card: Node = buildCard({ title: "Promo", text: "I", style: "banner" });
    assert.equal(card.body.contents[0].background.type, "linearGradient");
  });
});

describe("gaya profil", () => {
  it("avatar bulat dari gambar; tanpa gambar memakai inisial nama", () => {
    const withImage: Node = buildCard({ title: "Rmun", text: "Peran: Bot", style: "profil", imageUrl: "https://a.id/x.png" });
    const circle = withImage.header.contents[0].contents[0];
    assert.equal(circle.cornerRadius, "100px");
    assert.equal(circle.contents[0].type, "image");
    assert.equal("cornerRadius" in circle.contents[0], false); // LINE menolak cornerRadius pada image

    const initial: Node = buildCard({ title: "rmun", text: "Peran: Bot", style: "profil" });
    assert.equal(initial.header.contents[0].contents[0].contents[0].text, "R");
  });
});

describe("gaya struk", () => {
  it("nilai rata kanan, baris Total ditebalkan dengan garis di atasnya", () => {
    const card: Node = buildCard({ title: "Pesanan", text: "Kopi: Rp 25.000\nTotal: Rp 25.000", style: "struk" });
    const rows = card.body.contents.at(-1).contents as Node[];

    assert.deepEqual(rows.map((row) => row.type), ["box", "separator", "box"]);
    assert.equal(rows[0]!.contents[1].align, "end");
    assert.equal(rows[2]!.contents[0].weight, "bold");
    assert.equal(rows[2]!.contents[1].size, "lg");
  });
});

describe("gaya pengumuman", () => {
  it("lencana berwarna dari label dan judul besar", () => {
    const card: Node = buildCard({ title: "Rapat", text: "Hadir ya", style: "pengumuman", label: "Penting", theme: "merah" });
    const badge = card.body.contents[0].contents[0];

    assert.equal(badge.backgroundColor, CARD_THEMES.merah.solid);
    assert.equal(badge.contents[0].text, "PENTING");
    assert.equal(card.body.contents[1].size, "xxl");
  });
});

describe("gaya latar", () => {
  const author = { name: "Rmun", pictureUrl: "https://profile.line-scdn.net/abc" };
  const credit = "Powered By TeamAnuBot";

  it("seluruh kartu = gambar bergerak + lapisan hitam; navbar judul, isi tengah, bar bawah kredit kiri + foto kanan", () => {
    const card: Node = buildCard({ title: "Selamat Pagi", text: "Semangat!\nTerus ya", style: "latar", theme: "biru", imageUrl: "https://a.id/x.png", author, credit, sub: "Hari baru", label: "Sapaan" });

    assert.equal("header" in card, false);
    assert.equal("footer" in card, false);
    assert.equal(card.body.paddingAll, "0px");

    const [image, overlay] = card.body.contents[0].contents as Node[];
    assert.deepEqual({ url: image!.url, animated: image!.animated, mode: image!.aspectMode, size: image!.size }, { url: "https://a.id/x.png", animated: true, mode: "cover", size: "full" });
    assert.equal(overlay!.position, "absolute");
    assert.deepEqual([overlay!.offsetTop, overlay!.offsetBottom, overlay!.offsetStart, overlay!.offsetEnd], ["0px", "0px", "0px", "0px"]);

    const [navbar, middle, bottom] = overlay!.contents as Node[];
    assert.deepEqual(navbar!.contents.map((item: Node) => item.text), ["SAPAAN", "Selamat Pagi", "Hari baru"]);
    assert.equal(navbar!.backgroundColor, "#000000CC"); // navbar, tengah, dan bar bawah sama-sama dilapisi hitam 80%
    assert.equal(middle!.backgroundColor, "#000000CC");
    assert.deepEqual(middle!.contents.map((item: Node) => [item.text, item.align]), [["Semangat!", "center"], ["Terus ya", "center"]]);

    const bar = bottom!.contents[0];
    assert.equal(bottom!.backgroundColor, "#000000CC");
    assert.equal(bar.layout, "horizontal");
    assert.deepEqual({ text: bar.contents[0].text, flex: bar.contents[0].flex }, { text: credit, flex: 1 });
    assert.equal(bar.contents[1].cornerRadius, "18px");
    assert.equal(bar.contents[1].contents[0].url, author.pictureUrl);
    assert.equal(bar.contents.length, 2);
  });

  it("opasitas lapisan hitam bisa diatur", () => {
    const card: Node = buildCard({ title: "T", text: "I", style: "latar", imageUrl: "https://a.id/x.png", scrim: 40 });
    assert.equal(card.body.contents[0].contents[1].contents[0].backgroundColor, "#00000066");
  });

  it("rasio gambar bisa diatur (default 1:1) untuk GIF landscape", () => {
    const wide: Node = buildCard({ title: "T", text: "I", style: "latar", imageUrl: "https://a.id/x.png", ratio: "16:9" });
    const square: Node = buildCard({ title: "T", text: "I", style: "latar", imageUrl: "https://a.id/x.png" });

    assert.equal(wide.body.contents[0].contents[0].aspectRatio, "16:9");
    assert.equal(square.body.contents[0].contents[0].aspectRatio, "1:1");
  });

  it("isi '-' berarti tanpa teks tengah (navbar dan bar bawah tetap ada)", () => {
    const card: Node = buildCard({ title: "T", text: "-", style: "latar", imageUrl: "https://a.id/x.png", author, credit });
    const overlay = card.body.contents[0].contents[1];
    assert.deepEqual(overlay.contents.map((item: Node) => item.type), ["box", "box", "box"]);
  });

  it("tanpa foto profil: avatar inisial; tanpa pengirim: hanya teks kredit; tanpa keduanya: tanpa bar bawah", () => {
    const bottomOf = (card: Node) => card.body.contents[0].contents[1].contents[2];
    const initial: Node = buildCard({ title: "T", text: "I", style: "latar", imageUrl: "https://a.id/x.png", author: { name: "budi" }, credit });
    assert.equal(bottomOf(initial).contents[0].contents[1].contents[0].text, "B");

    const creditOnly: Node = buildCard({ title: "T", text: "I", style: "latar", imageUrl: "https://a.id/x.png", credit });
    assert.equal(bottomOf(creditOnly).contents[0].contents.length, 1);

    const none: Node = buildCard({ title: "T", text: "I", style: "latar", imageUrl: "https://a.id/x.png" });
    assert.equal(bottomOf(none), undefined);
  });

  it("tanpa gambar: latar memakai gradien tema", () => {
    const card: Node = buildCard({ title: "T", text: "Isi", style: "latar", theme: "biru", author, credit });
    assert.equal(card.body.contents[0].contents[0].background.type, "linearGradient");
  });

  it("tombol (jika ada) tampil di bar bawah di atas baris kredit/foto", () => {
    const card: Node = buildCard({ title: "T", text: "I", style: "latar", imageUrl: "https://a.id/x.png", author, credit, buttonLabel: "Buka", buttonUrl: "https://line.me" });
    assert.deepEqual(card.body.contents[0].contents[1].contents[2].contents.map((item: Node) => item.type), ["button", "box"]);
  });
});

describe("galeri", () => {
  it("carousel maks. 10 bubble; keterangan memberi latar gradien", () => {
    const gallery: Node = buildGallery(Array.from({ length: 12 }, (_, i) => ({ url: `https://a.id/${i}.jpg`, caption: i === 0 ? "Satu" : undefined })));

    assert.equal(gallery.type, "carousel");
    assert.equal(gallery.contents.length, 10);
    assert.equal(gallery.contents[0].body.background.type, "linearGradient");
    assert.equal("background" in gallery.contents[1].body, false);
    assertWellFormed(gallery, "galeri");
  });
});

describe("tema", () => {
  it("setiap tema punya gradien dan warna teks heksa yang lengkap", () => {
    for (const [name, theme] of Object.entries(CARD_THEMES)) {
      for (const key of ["startColor", "endColor", "text", "muted", "accent", "solid"] as const) {
        assert.match(theme[key], /^#[0-9A-F]{6}$/i, `${name}.${key}`);
      }
    }
  });
});
