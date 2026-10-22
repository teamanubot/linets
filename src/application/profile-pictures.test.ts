import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { MediaProcessor, MediaSender, ProfileViewer, UserPicture } from "../domain/ports.ts";
import { ProfilePictures } from "./profile-pictures.ts";
import { buf, FakeMessage } from "./test-doubles.ts";

const SELF = "u" + "a".repeat(32);
const BUDI = "u" + "b".repeat(32);
const SARI = "u" + "c".repeat(32);

class FakeViewer implements ProfileViewer {
  fetched: string[] = [];
  pictures: Record<string, UserPicture> = {};

  async fetchPicture(userId: string) {
    this.fetched.push(userId);
    const picture = this.pictures[userId];
    if (!picture) throw new Error("Profil pengguna itu tidak ditemukan.");
    return picture;
  }
}

class FakeSender implements MediaSender {
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

const media: MediaProcessor = {
  toJpeg: async (image) => image,
  extractFrame: async (video) => video,
  trimVideo: async (video) => video,
  videoDurationMs: async () => 7000,
  toSquareVideo: async () => buf("persegi"),
};

describe("ProfilePictures", () => {
  let viewer: FakeViewer;
  let sender: FakeSender;
  let service: ProfilePictures;

  beforeEach(() => {
    viewer = new FakeViewer();
    sender = new FakeSender();
    viewer.pictures[SELF] = { name: "Aku", image: buf("fotoku"), video: null };
    viewer.pictures[BUDI] = { name: "Budi", image: buf("fotoBudi"), video: buf("klipBudi") };
    viewer.pictures[SARI] = { name: "Sari", image: null, video: null };
    service = new ProfilePictures({ viewer, sender, media, selfId: SELF, maxTargets: 2, maxVideoBytes: 20 });
  });

  it("tpp me: kirim foto sendiri ke chat ini", async () => {
    const message = new FakeMessage({ chatId: "cG1" });
    await service.show("me", message);

    assert.deepEqual(viewer.fetched, [SELF]);
    assert.deepEqual(sender.sent, ["image:cG1:fotoku"]);
    assert.match(message.replies[0]!, /Foto profil Aku$/);
  });

  it("tpp @orang: foto lalu video (dengan durasi) kalau ada", async () => {
    const message = new FakeMessage({ chatId: "cG1", mentionedIds: [BUDI] });
    await service.show("@Budi", message);

    assert.deepEqual(sender.sent, ["image:cG1:fotoBudi", "video:cG1:klipBudi:7000"]);
    assert.match(message.replies[0]!, /Foto profil Budi \+ video profil/);
  });

  it("video lebih besar dari batas tidak dikirim, tapi diberi tahu", async () => {
    viewer.pictures[BUDI] = { name: "Budi", image: buf("f"), video: Buffer.alloc(100) };
    const message = new FakeMessage({ mentionedIds: [BUDI] });
    await service.show("", message);

    assert.deepEqual(sender.sent, ["image:cGROUP:f"]);
    assert.match(message.replies[0]!, /video terlalu besar/);
  });

  it("tanpa foto profil: hanya dilaporkan", async () => {
    const message = new FakeMessage({ mentionedIds: [SARI] });
    await service.show("", message);

    assert.deepEqual(sender.sent, []);
    assert.match(message.replies[0]!, /Sari tidak punya foto profil/);
  });

  it("id pengguna di teks dan mention digabung tanpa duplikat, dibatasi maxTargets", async () => {
    const message = new FakeMessage({ mentionedIds: [BUDI, SELF] });
    await service.show(`${BUDI} ${SARI}`, message);

    assert.deepEqual(viewer.fetched, [BUDI, SELF]);
    assert.match(message.replies.at(-1)!, /Hanya 2 orang pertama/);
  });

  it("chat pribadi tanpa argumen: foto lawan bicara", async () => {
    const message = new FakeMessage({ chatId: BUDI, isGroupChat: false });
    await service.show("", message);

    assert.deepEqual(viewer.fetched, [BUDI]);
    assert.equal(sender.sent[0], `image:${BUDI}:fotoBudi`);
  });

  it("grup tanpa target: beri petunjuk", async () => {
    const message = new FakeMessage();
    await service.show("", message);

    assert.deepEqual(viewer.fetched, []);
    assert.match(message.replies[0]!, /Pakai: tab tpp/);
  });

  it("commandName & label kustom (tcv/cover): dipakai di semua pesan, dengan atau tanpa video", async () => {
    const coverService = new ProfilePictures({ viewer, sender, media, selfId: SELF, commandName: "tcv", label: "cover" });

    const hint = new FakeMessage();
    await coverService.show("", hint);
    assert.match(hint.replies[0]!, /Pakai: tab tcv @orang \(mention\), tab tcv me, atau tab tcv <id pengguna>\.\nDi chat pribadi, tab tcv saja menampilkan foto lawan bicara\./);

    const onlyImage = new FakeMessage({ mentionedIds: [SELF] });
    await coverService.show("", onlyImage);
    assert.match(onlyImage.replies[0]!, /Foto cover Aku$/);

    const withVideo = new FakeMessage({ mentionedIds: [BUDI] });
    await coverService.show("", withVideo);
    assert.match(withVideo.replies[0]!, /Foto cover Budi \+ video cover/);

    const none = new FakeMessage({ mentionedIds: [SARI] });
    await coverService.show("", none);
    assert.match(none.replies[0]!, /Sari tidak punya foto cover/);
  });
});
