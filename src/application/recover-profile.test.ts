import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ImageShape, MediaProcessor, PictureGateway, ProfileGateway, ProfileSnapshot, ProfileSnapshotStore } from "../domain/ports.ts";
import { RecoverProfile } from "./recover-profile.ts";
import { buf, FakeMessage } from "./test-doubles.ts";

class FakeProfileGateway implements ProfileGateway {
  calls: string[] = [];
  async hasVideo() {
    return false;
  }
  async setDisplayName(name: string) {
    this.calls.push(`setDisplayName:${name}`);
  }
  async setStatusMessage(text: string) {
    this.calls.push(`setStatusMessage:${text}`);
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

class FakePictureGateway implements PictureGateway {
  calls: string[] = [];
  async hasVideo() {
    return false;
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

class FakeSnapshotStore implements ProfileSnapshotStore {
  snapshot: ProfileSnapshot | null = null;
  async save(snapshot: ProfileSnapshot) {
    this.snapshot = snapshot;
  }
  async load() {
    return this.snapshot;
  }
}

/** toJpeg menandai hasilnya dengan shape-nya, supaya tes bisa memastikan gambar mentah TIDAK langsung diunggah apa adanya. */
const media: MediaProcessor = {
  toJpeg: async (image: Buffer, shape: ImageShape) => Buffer.from(`jpeg(${shape}):${image}`),
  extractFrame: async (video) => video,
  trimVideo: async (video) => video,
  videoDurationMs: async () => 0,
  toSquareVideo: async () => buf(""),
};

const jpeg = (shape: ImageShape, data: string) => buf(`jpeg(${shape}):${data}`);

describe("RecoverProfile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "linebot-recover-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("belum pernah saveprofile: dibalas petunjuk, tidak mengubah apa pun", async () => {
    const profile = new FakeProfileGateway();
    const cover = new FakePictureGateway();
    const service = new RecoverProfile({ snapshotStore: new FakeSnapshotStore(), profile, cover, media });

    const message = new FakeMessage();
    await service.run("", message);

    assert.deepEqual(profile.calls, []);
    assert.match(message.replies[0]!, /Belum ada profil yang disimpan/);
  });

  it("memulihkan nama, status, foto+video profil, dan foto+video cover dari file yang masih ada (gambar dinormalkan lewat toJpeg)", async () => {
    const profileImagePath = join(dir, "pp.jpg");
    const profileVideoPath = join(dir, "pp.mp4");
    const coverImagePath = join(dir, "cover.jpg");
    const coverVideoPath = join(dir, "cover.mp4");
    await Promise.all([
      writeFile(profileImagePath, "foto-profil"),
      writeFile(profileVideoPath, "video-profil"),
      writeFile(coverImagePath, "foto-cover"),
      writeFile(coverVideoPath, "video-cover"),
    ]);

    const snapshotStore = new FakeSnapshotStore();
    snapshotStore.snapshot = { name: "Budi", statusMessage: "Lagi santai", profileImagePath, profileVideoPath, coverImagePath, coverVideoPath, savedAt: Date.now() };
    const profile = new FakeProfileGateway();
    const cover = new FakePictureGateway();
    const service = new RecoverProfile({ snapshotStore, profile, cover, media });

    const message = new FakeMessage();
    await service.run("", message);

    assert.deepEqual(profile.calls, [
      "setDisplayName:Budi",
      "setStatusMessage:Lagi santai",
      `setVideo:${buf("video-profil")}+${jpeg("square", "foto-profil")}`,
    ]);
    assert.deepEqual(cover.calls, [`setVideo:${buf("video-cover")}+${jpeg("portrait", "foto-cover")}`]);

    const reply = message.replies[0]!;
    assert.match(reply, /Nama & status dipulihkan ke "Budi"/);
    assert.match(reply, /Foto \+ video profil dipulihkan/);
    assert.match(reply, /Foto \+ video cover dipulihkan/);
  });

  it("hanya foto (tanpa video): pakai setImage dengan gambar yang sudah dinormalkan, bukan setVideo", async () => {
    const profileImagePath = join(dir, "pp.jpg");
    await writeFile(profileImagePath, "foto-profil");

    const snapshotStore = new FakeSnapshotStore();
    snapshotStore.snapshot = { name: "Budi", statusMessage: "", profileImagePath, profileVideoPath: null, coverImagePath: null, coverVideoPath: null, savedAt: Date.now() };
    const profile = new FakeProfileGateway();
    const cover = new FakePictureGateway();
    const service = new RecoverProfile({ snapshotStore, profile, cover, media });

    await service.run("", new FakeMessage());

    assert.deepEqual(profile.calls, ["setDisplayName:Budi", "setStatusMessage:", `setImage:${jpeg("square", "foto-profil")}`]);
    assert.deepEqual(cover.calls, []);
  });

  it("file sudah tidak ada: diberi tahu, tidak melempar error, nama/status tetap dipulihkan", async () => {
    const snapshotStore = new FakeSnapshotStore();
    snapshotStore.snapshot = {
      name: "Budi",
      statusMessage: "",
      profileImagePath: join(dir, "sudah-dihapus.jpg"),
      profileVideoPath: null,
      coverImagePath: null,
      coverVideoPath: null,
      savedAt: Date.now(),
    };
    const profile = new FakeProfileGateway();
    const cover = new FakePictureGateway();
    const service = new RecoverProfile({ snapshotStore, profile, cover, media });

    const message = new FakeMessage();
    await service.run("", message);

    assert.deepEqual(profile.calls, ["setDisplayName:Budi", "setStatusMessage:"]);
    assert.match(message.replies[0]!, /tidak bisa dipulihkan/);
  });

  it("snapshot tanpa foto/video sama sekali: cuma nama & status", async () => {
    const snapshotStore = new FakeSnapshotStore();
    snapshotStore.snapshot = { name: "Budi", statusMessage: "Halo", profileImagePath: null, profileVideoPath: null, coverImagePath: null, coverVideoPath: null, savedAt: Date.now() };
    const profile = new FakeProfileGateway();
    const cover = new FakePictureGateway();
    const service = new RecoverProfile({ snapshotStore, profile, cover, media });

    const message = new FakeMessage();
    await service.run("", message);

    assert.deepEqual(profile.calls, ["setDisplayName:Budi", "setStatusMessage:Halo"]);
    assert.deepEqual(cover.calls, []);
    assert.equal(message.replies[0]!.trim(), '✅ Nama & status dipulihkan ke "Budi".');
  });
});
