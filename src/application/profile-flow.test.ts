import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { MediaProcessor } from "../domain/ports.ts";
import { ProfileFlow } from "./profile-flow.ts";
import { buf, FakeMessage, FakeProfile } from "./test-doubles.ts";

const fakeMedia: MediaProcessor = {
  toJpeg: async (image, shape) => buf(`jpg(${image})`.replace("jpg", shape === "portrait" ? "pjpg" : "jpg")),
  extractFrame: async (video, shape) => buf(`${shape === "portrait" ? "pframe" : "frame"}(${video})`),
  trimVideo: async (video, maxSeconds) => buf(`${video}@${maxSeconds}s`),
  videoDurationMs: async () => 1000,
  toSquareVideo: async (video, mode) => buf(`${video}#${mode}`),
};

const image = (data: string) => new FakeMessage({ mediaKind: "image", data });
const video = (data: string) => new FakeMessage({ mediaKind: "video", data });
const command = () => new FakeMessage();

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
    assert.equal(await flow.handleMedia(photo), false);

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

describe("ProfileFlow untuk cover", () => {
  it("memakai bentuk potret, label cover, dan memotong video ke batas", async () => {
    const profile = new FakeProfile();
    const flow = new ProfileFlow({
      profile,
      media: fakeMedia,
      labels: { still: "cover", video: "video cover" },
      shape: "portrait",
      maxVideoSeconds: 15,
    });
    await flow.start("vp", command());
    await flow.handleMedia(image("foto"));
    const clip = video("klip");
    await flow.handleMedia(clip);

    assert.deepEqual(profile.calls, ["setVideo:klip@15s+pjpg(foto)"]);
    assert.match(clip.replies.at(-1)!, /Berhasil: video cover.*maks\. 15 detik/);
  });

  it("pp dengan video: pesan memakai label cover", async () => {
    const profile = new FakeProfile();
    profile.video = true;
    const flow = new ProfileFlow({ profile, media: fakeMedia, labels: { still: "cover", video: "video cover" }, shape: "portrait" });
    await flow.start("pp", command());
    const photo = image("foto");
    await flow.handleMedia(photo);

    assert.deepEqual(profile.calls, ["setImageKeepVideo:pjpg(foto)"]);
    assert.match(photo.replies[0]!, /cover sudah diganti, video cover tidak diubah/);
  });

  it("media tanpa alur aktif tidak dianggap ditangani", async () => {
    const flow = new ProfileFlow({ profile: new FakeProfile(), media: fakeMedia });
    assert.equal(await flow.handleMedia(image("foto")), false);
  });
});
