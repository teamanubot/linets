import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { ChatMessage, MediaKind } from "../domain/chat.ts";
import type { MediaProcessor, ProfileGateway } from "../domain/ports.ts";
import { ProfileFlow } from "./profile-flow.ts";

const buf = (text: string) => Buffer.from(text);

class FakeProfile implements ProfileGateway {
  calls: string[] = [];
  video = false;

  async hasVideo() {
    return this.video;
  }
  async setImage(jpg: Buffer) {
    this.calls.push(`setImage:${jpg}`);
  }
  async setImageKeepVideo(jpg: Buffer) {
    this.calls.push(`setImageKeepVideo:${jpg}`);
  }
  async setVideo(video: Buffer, image: Buffer) {
    this.calls.push(`setVideo:${video}+${image}`);
  }
  async setVideoKeepImage(video: Buffer) {
    this.calls.push(`setVideoKeepImage:${video}`);
  }
}

const fakeMedia: MediaProcessor = {
  toSquareJpeg: async (image) => buf(`jpg(${image})`),
  extractSquareFrame: async (video) => buf(`frame(${video})`),
};

class FakeMessage implements ChatMessage {
  replies: string[] = [];
  readonly isFromSelf = true;

  constructor(
    readonly mediaKind: MediaKind | null,
    private readonly data = "",
  ) {}

  get text() {
    return "";
  }
  async reply(text: string) {
    this.replies.push(text);
  }
  async downloadMedia() {
    return buf(this.data);
  }
}

const image = (data: string) => new FakeMessage("image", data);
const video = (data: string) => new FakeMessage("video", data);
const command = () => new FakeMessage(null);

describe("ProfileFlow", () => {
  let profile: FakeProfile;
  let clock: number;
  let flow: ProfileFlow;

  beforeEach(() => {
    profile = new FakeProfile();
    clock = 0;
    flow = new ProfileFlow({ profile, media: fakeMedia, stepTimeoutMs: 1000, now: () => clock });
  });

  it("pp tanpa video profil: ganti gambar biasa", async () => {
    const start = command();
    await flow.start("pp", start);
    const photo = image("foto");
    assert.equal(await flow.handleMedia(photo), true);

    assert.deepEqual(profile.calls, ["setImage:jpg(foto)"]);
    assert.match(photo.replies[0]!, /Berhasil/);
    assert.equal(flow.isActive, false);
  });

  it("pp dengan video profil: video tidak diubah", async () => {
    profile.video = true;
    await flow.start("pp", command());
    const photo = image("foto");
    await flow.handleMedia(photo);

    assert.deepEqual(profile.calls, ["setImageKeepVideo:jpg(foto)"]);
    assert.match(photo.replies[0]!, /video profil tidak diubah/);
  });

  it("vp: foto lalu video dikirim bersama", async () => {
    await flow.start("vp", command());
    const photo = image("foto");
    await flow.handleMedia(photo);
    assert.match(photo.replies[0]!, /kirim videonya/i);
    assert.equal(flow.isActive, true);

    const clip = video("klip");
    await flow.handleMedia(clip);
    assert.deepEqual(profile.calls, ["setVideo:klip+jpg(foto)"]);
    assert.match(clip.replies.at(-1)!, /Berhasil/);
    assert.equal(flow.isActive, false);
  });

  it("vp2: hanya video, gambar dipertahankan", async () => {
    await flow.start("vp2", command());
    const clip = video("klip");
    await flow.handleMedia(clip);

    assert.deepEqual(profile.calls, ["setVideoKeepImage:klip"]);
    assert.match(clip.replies.at(-1)!, /foto profil tidak diubah/);
  });

  it("media salah jenis: diberi tahu dan alur tetap aktif", async () => {
    await flow.start("pp", command());
    const wrong = video("klip");
    assert.equal(await flow.handleMedia(wrong), true);

    assert.match(wrong.replies[0]!, /gambar/);
    assert.deepEqual(profile.calls, []);
    assert.equal(flow.isActive, true);
  });

  it("alur kedaluwarsa setelah batas waktu", async () => {
    await flow.start("pp", command());
    clock = 1001;
    const photo = image("foto");
    assert.equal(await flow.handleMedia(photo), true);

    assert.deepEqual(profile.calls, []);
    assert.deepEqual(photo.replies, []);
  });

  it("cancel membatalkan alur", async () => {
    await flow.start("pp", command());
    flow.cancel();
    await flow.handleMedia(image("foto"));
    assert.deepEqual(profile.calls, []);
  });

  it("pesan teks bukan media", async () => {
    assert.equal(await flow.handleMedia(command()), false);
  });
});
