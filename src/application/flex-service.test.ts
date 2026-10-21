import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { FlexSender, ImageFacts, ImageInspector } from "../domain/ports.ts";
import { animationWarnings, CARD_THEMES, FlexService } from "./flex-service.ts";
import { FakeMessage, FakeSettingsStore } from "./test-doubles.ts";

const LIFF = "2009929108-vOiudUbo";

class FakeFlexSender implements FlexSender {
  sent: Array<{ chatId: string; liffId: string; altText: string; contents: Record<string, unknown> }> = [];
  async send(chatId: string, liffId: string, altText: string, contents: Record<string, unknown>) {
    this.sent.push({ chatId, liffId, altText, contents });
  }
}

describe("FlexService", () => {
  let sender: FakeFlexSender;
  let store: FakeSettingsStore;
  let service: FlexService;

  beforeEach(async () => {
    sender = new FakeFlexSender();
    store = new FakeSettingsStore();
    service = new FlexService({ sender, store });
    await service.init();
  });

  const withLiff = async () => service.configureLiff(LIFF, new FakeMessage());

  it("tab help: kartu latar bila LIFF diatur; teks biasa bila LIFF kosong atau kirim gagal", async () => {
    const card = { title: "Menu", label: "Bot", sub: "s", text: "a\nb" };

    const plain = new FakeMessage();
    await service.sendHelp(card, "TEKS BANTUAN", plain);
    assert.deepEqual(plain.replies, ["TEKS BANTUAN"]); // LIFF belum diatur
    assert.equal(sender.sent.length, 0);

    await withLiff();
    const sentOk = new FakeMessage();
    await service.sendHelp(card, "TEKS BANTUAN", sentOk);
    assert.deepEqual(sentOk.replies, []);
    assert.match(JSON.stringify(sender.sent[0]!.contents), /latar-flex\.png.*"animated":true|"animated":true.*latar-flex\.png/);

    sender.send = async () => Promise.reject(new Error("ditolak"));
    const failed = new FakeMessage();
    await service.sendHelp(card, "TEKS BANTUAN", failed);
    assert.deepEqual(failed.replies, ["TEKS BANTUAN"]);
  });

  it("tab liff: tampilkan status, atur id, validasi format, dan reset", async () => {
    const status = new FakeMessage();
    await service.configureLiff("", status);
    assert.match(status.replies[0]!, /LIFF belum diatur/);

    const bad = new FakeMessage();
    await service.configureLiff("ngawur", bad);
    assert.match(bad.replies[0]!, /Format id LIFF tidak valid/);
    assert.equal(store.saved.length, 0);

    const ok = new FakeMessage();
    await service.configureLiff(LIFF, ok);
    assert.match(ok.replies[0]!, new RegExp(`LIFF diatur: ${LIFF}`));
    assert.equal(store.saved.at(-1)?.liff.id, LIFF);

    const shown = new FakeMessage();
    await service.configureLiff("", shown);
    assert.match(shown.replies[0]!, new RegExp(`LIFF aktif: ${LIFF}`));

    await service.configureLiff("reset", new FakeMessage());
    assert.equal(store.saved.at(-1)?.liff.id, "");
  });

  it("tab flex tanpa LIFF: diminta mengatur LIFF dan tidak mengirim", async () => {
    const message = new FakeMessage();
    await service.sendCard("Judul | Isi", message);

    assert.deepEqual(sender.sent, []);
    assert.match(message.replies[0]!, /LIFF belum diatur/);
  });

  it("tab flex: kirim kartu ke chat ini dengan LIFF yang diatur; judul jadi altText", async () => {
    await withLiff();
    const message = new FakeMessage({ chatId: "cG1" });
    await service.sendCard("Halo Dunia | Ini isi | Buka | https://line.me", message);

    assert.equal(sender.sent.length, 1);
    const [sent] = sender.sent;
    assert.equal(sent!.chatId, "cG1");
    assert.equal(sent!.liffId, LIFF);
    assert.equal(sent!.altText, "Halo Dunia");
    assert.equal(sent!.contents.type, "bubble");
    assert.equal(sent!.contents.size, "kilo");
  });

  it("tab flex: opsi tema, gambar, gaya, dan oleh boleh di posisi mana pun", async () => {
    await withLiff();
    await service.sendCard(
      "Selamat! | Kamu menang | tema:Hijau | Klaim | https://line.me | gambar:https://contoh.id/a.jpg | oleh:Rmun | gaya:Polos",
      new FakeMessage(),
    );

    const contents = sender.sent[0]!.contents as { size: string; hero: { url: string }; footer: { contents: Array<{ text?: string }> } };
    assert.equal(contents.size, "mega"); // gaya polos
    assert.equal(contents.hero.url, "https://contoh.id/a.jpg");
    assert.equal(contents.footer.contents.at(-1)!.text, "Rmun"); // kredit "oleh" ada di footer
  });

  it("tab flex: tema tidak dikenal dan gambar non-https ditolak", async () => {
    await withLiff();
    const badTheme = new FakeMessage();
    await service.sendCard("J | I | tema:pelangi", badTheme);
    const badImage = new FakeMessage();
    await service.sendCard("J | I | gambar:http://contoh.id/a.jpg", badImage);
    const badStyle = new FakeMessage();
    await service.sendCard("J | I | gaya:futuristik", badStyle);
    const longCredit = new FakeMessage();
    await service.sendCard(`J | I | oleh:${"x".repeat(41)}`, longCredit);

    assert.match(badTheme.replies[0]!, /Tema "pelangi" tidak ada\. Pilihan: pink, biru, senja, hijau, kuning, merah, ungu, hitam/);
    assert.match(badStyle.replies[0]!, /Gaya "futuristik" tidak ada\. Pilihan: chino, bisnis, banner, profil, struk, pengumuman, polos/);
    assert.match(longCredit.replies[0]!, /Teks "oleh" maks\. 40/);
    assert.match(badImage.replies[0]!, /Link gambar\/GIF harus diawali https:\/\//);
    assert.equal(sender.sent.length, 0);
  });

  it("tab flex: validasi masukan", async () => {
    await withLiff();
    const cases: Array<[string, RegExp]> = [
      ["", /Pakai: tab flex/],
      ["Judul saja", /Pakai: tab flex/],
      ["tema:hijau | gambar:https://a.id/x.jpg", /Pakai: tab flex/],
      ["J | I | Label", /Tombol butuh label dan link/],
      ["J | I | Label | bukan-link", /http:\/\/ atau https:\/\//],
      [`J | I | ${"x".repeat(21)} | https://a.id`, /Label tombol maks/],
      [`${"j".repeat(101)} | isi`, /Judul maks/],
    ];
    for (const [input, expected] of cases) {
      const message = new FakeMessage();
      await service.sendCard(input, message);
      assert.match(message.replies[0]!, expected, input);
    }
    assert.deepEqual(sender.sent, []);
  });

  it("tab flexjson: kirim bubble/carousel, tolak JSON rusak atau tipe lain", async () => {
    await withLiff();
    await service.sendJson('{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[]}}', new FakeMessage());
    await service.sendJson('{"type":"carousel","contents":[]}', new FakeMessage());
    assert.deepEqual(sender.sent.map((item) => item.contents.type), ["bubble", "carousel"]);
    assert.equal(sender.sent[0]!.altText, "Flex Message");

    for (const [input, expected] of [
      ["", /Pakai: tab flexjson/],
      ["{rusak", /JSON tidak valid/],
      ['{"type":"text"}', /"bubble" atau "carousel"/],
      ["[1,2]", /"bubble" atau "carousel"/],
      ["x".repeat(30_001), /terlalu panjang/],
    ] as const) {
      const message = new FakeMessage();
      await service.sendJson(input, message);
      assert.match(message.replies[0]!, expected, input.slice(0, 20));
    }
    assert.equal(sender.sent.length, 2);
  });

  it("pengaturan LIFF dimuat dari penyimpanan saat init", async () => {
    const saved = new FakeSettingsStore({ autoReply: { enabled: false, text: "" }, antiUnsend: { enabled: true }, liff: { id: LIFF }, flex: { style: "chino", theme: "pink", credit: "Powered By TeamAnuBot" }, groupGuard: { enabled: true } });
    const loaded = new FlexService({ sender, store: saved });
    await loaded.init();
    await loaded.sendCard("J | I", new FakeMessage());

    assert.equal(sender.sent[0]?.liffId, LIFF);
  });
});

describe("animationWarnings", () => {
  it("APNG kecil tanpa henti: tidak ada peringatan", () => {
    assert.deepEqual(animationWarnings({ kind: "apng", bytes: 62_000, plays: 0 }), []);
  });

  it("APNG tepat 300.000 byte masih boleh; satu byte lebih tidak", () => {
    assert.deepEqual(animationWarnings({ kind: "apng", bytes: 300_000, plays: 0 }), []);
    assert.equal(animationWarnings({ kind: "apng", bytes: 300_001, plays: 0 }).length, 1);
  });

  it("APNG dengan putaran terbatas: diberi tahu akan berhenti (seperti stiker LINE 3 putaran)", () => {
    const [warning] = animationWarnings({ kind: "apng", bytes: 84_034, plays: 3 });
    assert.match(warning!, /hanya berputar 3 kali lalu berhenti/);
  });

  it("besar dan terbatas sekaligus: dua peringatan; PNG/JPEG biasa: informasi tidak bergerak", () => {
    assert.equal(animationWarnings({ kind: "apng", bytes: 500_000, plays: 2 }).length, 2);
    assert.match(animationWarnings({ kind: "png" })[0]!, /PNG biasa/);
    assert.match(animationWarnings({ kind: "jpeg" })[0]!, /JPEG/);
    assert.deepEqual(animationWarnings({ kind: "other" }), []);
  });
});

describe("FlexService: gaya, pratinjau, galeri", () => {
  let sender: FakeFlexSender;
  let store: FakeSettingsStore;
  let service: FlexService;

  beforeEach(async () => {
    sender = new FakeFlexSender();
    store = new FakeSettingsStore();
    service = new FlexService({ sender, store, pauseMs: 0 });
    await service.init();
    await service.configureLiff(LIFF, new FakeMessage());
  });

  it("tab flexgaya tanpa argumen: tampilkan gaya bawaan dan daftar gaya", async () => {
    const message = new FakeMessage();
    await service.configureStyle("", message);

    assert.match(message.replies[0]!, /Gaya Flex bawaan: chino · tema: pink/);
    for (const name of ["chino", "bisnis", "banner", "profil", "struk", "pengumuman", "polos", "latar"]) assert.match(message.replies[0]!, new RegExp(`${name} —`));
  });

  it("tab flexgaya <gaya> <tema>: mengganti bawaan (urutan bebas), tersimpan, dan dipakai tab flex", async () => {
    const message = new FakeMessage();
    await service.configureStyle("Biru  Bisnis", message);

    assert.match(message.replies[0]!, /Gaya bawaan: bisnis · tema: biru/);
    assert.deepEqual(store.saved.at(-1)?.flex, { style: "bisnis", theme: "biru", credit: "Powered By TeamAnuBot" });

    await service.sendCard("Judul | Isi", new FakeMessage());
    const contents = sender.sent[0]!.contents as { size: string; styles: unknown; header?: unknown };
    assert.equal(contents.size, "mega"); // bisnis
    assert.ok(contents.styles);
  });

  it("opsi gaya/tema pada tab flex menang atas bawaan tanpa mengubahnya", async () => {
    await service.configureStyle("bisnis", new FakeMessage());
    await service.sendCard("Judul | Isi | gaya:chino", new FakeMessage());

    assert.equal((sender.sent[0]!.contents as { size: string }).size, "kilo");
    assert.equal(store.saved.at(-1)?.flex.style, "bisnis");
  });

  it("tab flexgaya: token tidak dikenal ditolak tanpa menyimpan; reset mengembalikan bawaan", async () => {
    const bad = new FakeMessage();
    await service.configureStyle("futuristik", bad);
    assert.match(bad.replies[0]!, /"futuristik" bukan gaya atau tema/);
    assert.equal(store.saved.filter((item) => item.flex.style !== "chino").length, 0);

    await service.configureStyle("banner hijau", new FakeMessage());
    const reset = new FakeMessage();
    await service.configureStyle("reset", reset);
    assert.deepEqual(store.saved.at(-1)?.flex, { style: "chino", theme: "pink", credit: "Powered By TeamAnuBot" });
    assert.match(reset.replies[0]!, /dikembalikan ke bawaan/);
  });

  it("tab flexgaya contoh: kirim satu kartu per gaya; bisa satu gaya saja; gaya salah ditolak", async () => {
    await service.configureStyle("contoh", new FakeMessage());
    assert.equal(sender.sent.length, 8);
    assert.deepEqual(sender.sent.map((item) => item.altText), ["chino", "bisnis", "banner", "profil", "struk", "pengumuman", "polos", "latar"].map((name) => `Contoh gaya ${name}`));

    sender.sent.length = 0;
    await service.configureStyle("contoh Banner gambar:https://contoh.id/x.png", new FakeMessage());
    assert.equal(sender.sent.length, 1);
    assert.match(JSON.stringify(sender.sent[0]!.contents), /https:\/\/contoh\.id\/x\.png/);

    const bad = new FakeMessage();
    await service.configureStyle("contoh ngawur", bad);
    assert.match(bad.replies[0]!, /Gaya tidak dikenal/);
    assert.equal(sender.sent.length, 1);
  });

  it("tab flex: opsi label, sub, dan tombol2", async () => {
    await service.sendCard("Judul | Isi | Beli | https://a.id | gaya:bisnis | label:Promo | sub:Hari ini saja | tombol2:Pelajari>https://b.id", new FakeMessage());

    const json = JSON.stringify(sender.sent[0]!.contents);
    assert.match(json, /"PROMO"/);
    assert.match(json, /Hari ini saja/);
    assert.match(json, /"label":"Pelajari","uri":"https:\/\/b\.id"/);
  });

  it("tab flex: tombol2 dan opsi lain divalidasi", async () => {
    for (const [input, expected] of [
      ["J | I | tombol2:tanpa-pemisah", /Format tombol kedua/],
      ["J | I | tombol2:Label>bukan-link", /Format tombol kedua/],
      [`J | I | label:${"x".repeat(25)}`, /"label" maks/],
      [`J | I | sub:${"x".repeat(101)}`, /"sub" maks/],
    ] as const) {
      const message = new FakeMessage();
      await service.sendCard(input, message);
      assert.match(message.replies[0]!, expected, input);
    }
    assert.equal(sender.sent.length, 0);
  });

  it("gaya latar: bar bawah memakai foto tab.jpeg; opsi gif/latar = gambar", async () => {
    const identity = { current: async () => ({ name: "Rmun", pictureUrl: "https://profile.line-scdn.net/xyz" }) };
    service = new FlexService({ sender, store, pauseMs: 0, identity });
    await service.init();
    await service.sendCard("Selamat Pagi | Semangat ya | gaya:latar | gif:https://a.id/x.gif", new FakeMessage());
    await service.sendCard("Halo | Isi | gaya:latar | latar:https://a.id/y.gif", new FakeMessage());

    const first = JSON.stringify(sender.sent[0]!.contents);
    assert.match(first, /"animated":true/);
    assert.match(first, /https:\/\/a\.id\/x\.gif/);
    assert.match(first, /https:\/\/raw\.githubusercontent\.com\/teamanubot\/linets\/main\/assets\/tab\.jpeg/); // foto bar bawah = tab.jpeg
    assert.doesNotMatch(first, /profile\.line-scdn\.net/);
    assert.match(first, /"text":"Powered By TeamAnuBot"/); // teks kredit bawaan di kiri bar bawah
    assert.match(JSON.stringify(sender.sent[1]!.contents), /https:\/\/a\.id\/y\.gif/);
  });

  it("tab flexgaya oleh: lihat, ganti, batasi panjang, reset; dipakai gaya latar; opsi oleh: menang", async () => {
    const identity = { current: async () => ({ name: "Rmun" }) };
    service = new FlexService({ sender, store, pauseMs: 0, identity });
    await service.init();

    const shown = new FakeMessage();
    await service.configureStyle("oleh", shown);
    assert.match(shown.replies[0]!, /Powered By TeamAnuBot/);

    await service.configureStyle("OLEH Dibuat Rmun", new FakeMessage());
    assert.equal(store.saved.at(-1)?.flex.credit, "Dibuat Rmun"); // huruf besar/kecil teks dipertahankan
    await service.sendCard("J | I | gaya:latar | gif:https://a.id/x.png", new FakeMessage());
    await service.sendCard("J | I | gaya:latar | gif:https://a.id/x.png | oleh:Khusus", new FakeMessage());
    assert.match(JSON.stringify(sender.sent[0]!.contents), /"text":"Dibuat Rmun"/);
    assert.match(JSON.stringify(sender.sent[1]!.contents), /"text":"Khusus"/);

    const tooLong = new FakeMessage();
    await service.configureStyle(`oleh ${"x".repeat(41)}`, tooLong);
    assert.match(tooLong.replies[0]!, /maks\. 40/);

    await service.configureStyle("oleh reset", new FakeMessage());
    assert.equal(store.saved.at(-1)?.flex.credit, "Powered By TeamAnuBot");
  });

  it("opsi rasio: dipakai sebagai aspectRatio gambar latar; format tidak sah ditolak", async () => {
    await service.sendCard("J | I | gaya:latar | gif:https://a.id/x.png | rasio:25:14", new FakeMessage());
    assert.match(JSON.stringify(sender.sent[0]!.contents), /"aspectRatio":"25:14"/);

    for (const bad of ["rasio:16-9", "rasio:0:5", "rasio:1:4", "rasio:abc"]) {
      const message = new FakeMessage();
      await service.sendCard(`J | I | gaya:latar | ${bad}`, message);
      assert.match(message.replies[0]!, /Format rasio: rasio:16:9/, bad);
    }
    assert.equal(sender.sent.length, 1);
  });

  it("gaya latar: gambar diperiksa dan peringatan dikirim bila animasi tidak akan diputar", async () => {
    const facts: Record<string, ImageFacts | null> = {
      "https://a.id/besar.png": { kind: "apng", bytes: 918_202, plays: 0, frames: 29 },
      "https://a.id/ok.png": { kind: "apng", bytes: 280_984, plays: 0, frames: 23 },
      "https://a.id/anim.gif": { kind: "gif", bytes: 2_148_236 },
      "https://a.id/mati.png": null,
    };
    const inspector: ImageInspector = { inspect: async (url) => facts[url] ?? null };
    service = new FlexService({ sender, store, pauseMs: 0, inspector });
    await service.init();

    const replies: Record<string, string[]> = {};
    for (const name of ["besar", "ok", "mati"]) {
      const message = new FakeMessage();
      await service.sendCard(`J | I | gaya:latar | gif:https://a.id/${name}.png`, message);
      replies[name] = message.replies;
    }
    const gif = new FakeMessage();
    await service.sendCard("J | I | gaya:latar | gif:https://a.id/anim.gif", gif);
    const other = new FakeMessage();
    await service.sendCard("J | I | gaya:bisnis | gambar:https://a.id/besar.png", other);

    assert.match(replies.besar![0]!, /APNG ini 918 KB, melebihi batas animasi Flex 300 KB.*TIDAK diputar/);
    assert.deepEqual(replies.ok, []); // 281 KB < 300 KB dan tanpa henti: tidak ada peringatan
    assert.deepEqual(replies.mati, []); // gagal memeriksa: diam saja
    assert.match(gif.replies[0]!, /Gambar ini GIF: Flex tidak menganimasikan GIF/);
    assert.deepEqual(other.replies, []); // hanya gaya latar yang memakai animasi
    assert.equal(sender.sent.length, 5); // semua tetap terkirim
  });

  it("gaya latar: gagal mengambil identitas tidak membatalkan kirim (foto tetap tab.jpeg)", async () => {
    const identity = { current: async () => Promise.reject(new Error("offline")) };
    service = new FlexService({ sender, store, pauseMs: 0, identity });
    await service.init();
    await service.sendCard("Judul | Isi | gaya:latar | gif:https://a.id/x.gif", new FakeMessage());

    assert.equal(sender.sent.length, 1);
    assert.match(JSON.stringify(sender.sent[0]!.contents), /assets\/tab\.jpeg/);
  });

  it("gaya selain latar tidak memanggil penyedia identitas", async () => {
    let calls = 0;
    service = new FlexService({ sender, store, pauseMs: 0, identity: { current: async () => (calls++, { name: "x" }) } });
    await service.init();
    await service.sendCard("Judul | Isi | gaya:bisnis", new FakeMessage());

    assert.equal(calls, 0);
  });

  it("tab flexgaleri: carousel gambar dengan keterangan", async () => {
    await service.sendGallery("https://a.id/1.jpg | Satu | https://a.id/2.jpg | https://a.id/3.jpg | Tiga", new FakeMessage());

    const contents = sender.sent[0]!.contents as { type: string; contents: Array<{ body: { contents: Array<{ url?: string }> } }> };
    assert.equal(contents.type, "carousel");
    assert.equal(contents.contents.length, 3);
    assert.equal(contents.contents[0]!.body.contents[0]!.url, "https://a.id/1.jpg");
    assert.equal(contents.contents[0]!.body.contents.length, 2); // gambar + keterangan
    assert.equal(contents.contents[1]!.body.contents.length, 1); // tanpa keterangan
    assert.equal(sender.sent[0]!.altText, "Galeri (3 gambar)");
  });

  it("tab flexgaleri: beberapa url dalam satu bagian, dan validasi", async () => {
    await service.sendGallery("https://a.id/1.jpg https://a.id/2.jpg", new FakeMessage());
    assert.equal((sender.sent[0]!.contents as { contents: unknown[] }).contents.length, 2);

    const none = new FakeMessage();
    await service.sendGallery("", none);
    const bad = new FakeMessage();
    await service.sendGallery("http://a.id/1.jpg", bad);
    const tooMany = new FakeMessage();
    await service.sendGallery(Array.from({ length: 11 }, (_, i) => `https://a.id/${i}.jpg`).join(" | "), tooMany);

    assert.match(none.replies[0]!, /Pakai: tab flexgaleri/);
    assert.match(bad.replies[0]!, /bukan link gambar https/);
    assert.match(tooMany.replies[0]!, /Maksimal 10 gambar/);
    assert.equal(sender.sent.length, 1);
  });
});
