import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { CachedMedia, ChatSender, MediaProcessor, MediaSender, UnsendMediaCache } from "../domain/ports.ts";
import { AntiUnsend } from "./anti-unsend.ts";
import { buf, FakePeople, FakeSettingsStore, FakeMessage } from "./test-doubles.ts";

const other = (id: string, text: string, extra: ConstructorParameters<typeof FakeMessage>[0] = {}) =>
  new FakeMessage({ id, text, fromSelf: false, senderId: "uBUDI", ...extra });

class FakeChatSender implements ChatSender {
  sent: Array<{ chatId: string; text: string }> = [];
  async sendText(chatId: string, text: string) {
    this.sent.push({ chatId, text });
  }
}

class FakeMediaSender implements MediaSender {
  sent: string[] = [];
  async sendImage(chatId: string, image: Buffer) {
    this.sent.push(`image:${chatId}:${image}`);
  }
  async sendVideo(chatId: string, video: Buffer, durationMs: number) {
    this.sent.push(`video:${chatId}:${video}:${durationMs}`);
  }
  async sendAudio(chatId: string, audio: Buffer, durationMs: number) {
    this.sent.push(`audio:${chatId}:${audio}:${durationMs}`);
  }
  async sendFile(chatId: string, file: Buffer, filename: string) {
    this.sent.push(`file:${chatId}:${file}:${filename}`);
  }
}

class FakeUnsendMediaCache implements UnsendMediaCache {
  private readonly items = new Map<string, CachedMedia>();
  puts: Array<{ messageId: string; media: CachedMedia }> = [];

  async put(messageId: string, media: CachedMedia) {
    this.puts.push({ messageId, media });
    this.items.set(messageId, media);
  }
  async take(messageId: string) {
    const media = this.items.get(messageId) ?? null;
    this.items.delete(messageId);
    return media;
  }
}

const media: MediaProcessor = {
  toJpeg: async (image) => image,
  extractFrame: async (video) => video,
  trimVideo: async (video) => video,
  videoDurationMs: async () => 7000,
  toSquareVideo: async () => buf("persegi"),
};

describe("AntiUnsend", () => {
  let chatSender: FakeChatSender;
  let mediaSender: FakeMediaSender;
  let mediaCache: FakeUnsendMediaCache;
  let service: AntiUnsend;

  beforeEach(async () => {
    chatSender = new FakeChatSender();
    mediaSender = new FakeMediaSender();
    mediaCache = new FakeUnsendMediaCache();
    service = new AntiUnsend({
      store: new FakeSettingsStore(),
      chatSender,
      mediaSender,
      mediaCache,
      media,
      people: new FakePeople({ uBUDI: "Budi" }),
      capacity: 3,
    });
    await service.init();
    await service.configure("on", new FakeMessage({ chatId: "cG1" })); // chat default dipakai banyak tes di bawah
  });

  it("memberi tahu isi pesan orang lain yang ditarik, dikirim ke chat tempat kejadiannya", async () => {
    await service.configure("on", new FakeMessage({ chatId: "cPRIBADI" }));
    service.remember(other("m1", "rahasia", { chatId: "cPRIBADI" }));
    await service.onUnsent("m1");

    assert.equal(chatSender.sent.length, 1);
    assert.equal(chatSender.sent[0]!.chatId, "cPRIBADI");
    assert.match(chatSender.sent[0]!.text, /Dari: Budi/);
    assert.match(chatSender.sent[0]!.text, /Isi: rahasia/);
  });

  it("gambar: dicache saat masuk, lalu dikirim ulang ke chat itu saat ditarik", async () => {
    service.remember(other("m2", "", { mediaKind: "image", data: "isi-gambar", chatId: "cG1" }));
    await new Promise((resolve) => setImmediate(resolve)); // tunggu cache (fire-and-forget) selesai

    assert.equal(mediaCache.puts.length, 1);
    assert.equal(mediaCache.puts[0]!.media.kind, "image");

    await service.onUnsent("m2");
    assert.match(chatSender.sent[0]!.text, /\[gambar\]/);
    assert.match(chatSender.sent[0]!.text, /dikirim ulang di bawah/);
    assert.deepEqual(mediaSender.sent, [`image:cG1:${buf("isi-gambar")}`]);
  });

  it("video: dikirim ulang dengan durasi dari MediaProcessor", async () => {
    service.remember(other("m2v", "", { mediaKind: "video", data: "isi-video", chatId: "cG1" }));
    await new Promise((resolve) => setImmediate(resolve));

    await service.onUnsent("m2v");
    assert.deepEqual(mediaSender.sent, [`video:cG1:${buf("isi-video")}:7000`]);
  });

  it("file: dikirim ulang dengan nama aslinya", async () => {
    service.remember(other("m2f", "", { file: { name: "laporan.pdf", size: 2048 }, data: "isi-file", chatId: "cG1" }));
    await new Promise((resolve) => setImmediate(resolve));

    await service.onUnsent("m2f");
    assert.match(chatSender.sent[0]!.text, /\[file\] laporan\.pdf/);
    assert.deepEqual(mediaSender.sent, [`file:cG1:${buf("isi-file")}:laporan.pdf`]);
  });

  it("gambar/video/file yang tidak (lagi) tercache: cuma diberi tahu, tanpa dikirim ulang", async () => {
    service.remember(other("m2x", "", { mediaKind: "image", chatId: "cG1" }));
    await new Promise((resolve) => setImmediate(resolve));
    // "mengosongkan" cache-nya lagi, mensimulasikan sudah kedaluwarsa/terlanjur diambil sebelumnya.
    await mediaCache.take("m2x");

    await service.onUnsent("m2x");
    assert.match(chatSender.sent[0]!.text, /\[gambar\]/);
    assert.match(chatSender.sent[0]!.text, /sudah tidak bisa diambil ulang/);
    assert.deepEqual(mediaSender.sent, []);
  });

  it("sticker: detailnya saja yang dikirim, tidak ada media yang dicache", async () => {
    service.remember(other("m5", "", { sticker: { packageId: "123", stickerId: "456" }, chatId: "cG1" }));
    await new Promise((resolve) => setImmediate(resolve));
    await service.onUnsent("m5");

    assert.equal(mediaCache.puts.length, 0);
    assert.match(chatSender.sent[0]!.text, /\[sticker\] id 456 \(paket 123\)/);
    assert.deepEqual(mediaSender.sent, []);
  });

  it("lokasi: detailnya ditampilkan lengkap", async () => {
    service.remember(other("m6", "", { location: { title: "Monas", address: "Jakarta Pusat", latitude: -6.1754, longitude: 106.8272 }, chatId: "cG1" }));
    await service.onUnsent("m6");

    assert.match(chatSender.sent[0]!.text, /\[lokasi\] Monas — Jakarta Pusat \(-6\.1754, 106\.8272\)/);
  });

  it("pesan sendiri tidak dicatat; pesan tak dikenal diabaikan", async () => {
    service.remember(new FakeMessage({ id: "m3", text: "punyaku", fromSelf: true }));
    await service.onUnsent("m3");
    await service.onUnsent("tidak-ada");
    assert.deepEqual(chatSender.sent, []);
  });

  it("kapasitas terbatas: pesan paling lama dilepas", async () => {
    await service.configure("on", new FakeMessage({ chatId: "cGROUP" }));
    for (const id of ["a", "b", "c", "d"]) service.remember(other(id, id));
    await service.onUnsent("a");
    await service.onUnsent("d");
    assert.equal(chatSender.sent.length, 1);
    assert.match(chatSender.sent[0]!.text, /Isi: d/);
  });

  it("tab antiunsend off: tidak ada pemberitahuan dan pengaturan tersimpan", async () => {
    const store = new FakeSettingsStore();
    const off = new AntiUnsend({ store, chatSender, mediaSender, mediaCache, media, people: new FakePeople() });
    await off.init();
    const reply = new FakeMessage();
    await off.configure("off", reply);
    off.remember(other("m4", "x"));
    await off.onUnsent("m4");

    assert.deepEqual(chatSender.sent, []);
    assert.equal(store.saved.at(-1)?.antiUnsend.chats["cGROUP"], false);
    assert.match(reply.replies[0]!, /dimatikan di chat ini/);
  });

  it("tab antiunsend tanpa argumen: tampilkan status chat ini (bawaan mati, lalu aktif setelah di-on-kan)", async () => {
    const before = new FakeMessage({ chatId: "cBARU" });
    await service.configure("", before);
    assert.match(before.replies[0]!, /MATI/);

    await service.configure("on", new FakeMessage({ chatId: "cBARU" }));
    const after = new FakeMessage({ chatId: "cBARU" });
    await service.configure("", after);
    assert.match(after.replies[0]!, /AKTIF/);
  });

  it("per chat: nyala di satu chat tidak memengaruhi chat lain (tetap mati bawaan)", async () => {
    await service.configure("on", new FakeMessage({ chatId: "cA" }));

    service.remember(other("mA", "pesan di A", { chatId: "cA" }));
    service.remember(other("mB", "pesan di B", { chatId: "cB" })); // cB tidak pernah di-on-kan, tetap mati bawaan
    await service.onUnsent("mA");
    await service.onUnsent("mB");

    assert.equal(chatSender.sent.length, 1);
    assert.equal(chatSender.sent[0]!.chatId, "cA");
  });

  it("chat yang belum pernah diatur: dianggap MATI (bawaan)", () => {
    assert.equal(service.isEnabled("chat-baru-mana-pun"), false);
  });
});
