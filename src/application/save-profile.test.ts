import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProfileMediaKind, ProfileMediaStore, ProfileSnapshot, ProfileSnapshotStore, ProfileStatusProvider, ProfileViewer, UserPicture } from "../domain/ports.ts";
import { SaveProfile } from "./save-profile.ts";
import { buf, FakeMessage } from "./test-doubles.ts";

const SELF = "u" + "a".repeat(32);

class FakeViewer implements ProfileViewer {
  fetched: string[] = [];
  picture: UserPicture = { name: "Aku", image: null, video: null };
  fail = false;

  async fetchPicture(userId: string) {
    this.fetched.push(userId);
    if (this.fail) throw new Error("gagal ambil profil");
    return this.picture;
  }
}

class FakeStatusProvider implements ProfileStatusProvider {
  fetched: string[] = [];
  status = "Sibuk";
  fail = false;

  async statusMessage(userId: string) {
    this.fetched.push(userId);
    if (this.fail) throw new Error("gagal ambil status");
    return this.status;
  }
}

const FILENAMES: Record<ProfileMediaKind, string> = {
  fotoprofile: "fotoprofile.jpg",
  videoprofile: "videoprofile.mp4",
  fotocover: "fotocover.jpg",
  videocover: "videocover.mp4",
};

class FakeStore implements ProfileMediaStore {
  saved: Array<{ data: string; kind: ProfileMediaKind }> = [];

  async save(kind: ProfileMediaKind, data: Buffer) {
    this.saved.push({ data: data.toString(), kind });
    return `./downloads/${FILENAMES[kind]}`;
  }
}

class FakeSnapshotStore implements ProfileSnapshotStore {
  saved: ProfileSnapshot[] = [];
  async save(snapshot: ProfileSnapshot) {
    this.saved.push(snapshot);
  }
  async load() {
    return this.saved.at(-1) ?? null;
  }
}

describe("SaveProfile", () => {
  it("menyimpan nama, status, foto & video profil, serta foto & video cover akun sendiri, dan snapshotnya", async () => {
    const profileViewer = new FakeViewer();
    profileViewer.picture = { name: "Aku", image: buf("foto-profil"), video: buf("video-profil") };
    const coverViewer = new FakeViewer();
    coverViewer.picture = { name: "Aku", image: buf("foto-cover"), video: buf("video-cover") };
    const statusProvider = new FakeStatusProvider();
    const mediaStore = new FakeStore();
    const snapshotStore = new FakeSnapshotStore();
    const service = new SaveProfile({ profileViewer, coverViewer, statusProvider, mediaStore, snapshotStore, selfId: SELF });

    const message = new FakeMessage();
    await service.run("", message);

    assert.deepEqual(profileViewer.fetched, [SELF]);
    assert.deepEqual(coverViewer.fetched, [SELF]);
    assert.deepEqual(statusProvider.fetched, [SELF]);
    assert.deepEqual(mediaStore.saved, [
      { data: "foto-profil", kind: "fotoprofile" },
      { data: "video-profil", kind: "videoprofile" },
      { data: "foto-cover", kind: "fotocover" },
      { data: "video-cover", kind: "videocover" },
    ]);

    assert.equal(snapshotStore.saved.length, 1);
    const snapshot = snapshotStore.saved[0]!;
    assert.equal(snapshot.name, "Aku");
    assert.equal(snapshot.statusMessage, "Sibuk");
    assert.match(snapshot.profileImagePath!, /fotoprofile\.jpg$/);
    assert.match(snapshot.profileVideoPath!, /videoprofile\.mp4$/);
    assert.match(snapshot.coverImagePath!, /fotocover\.jpg$/);
    assert.match(snapshot.coverVideoPath!, /videocover\.mp4$/);

    const reply = message.replies[0]!;
    assert.match(reply, /Profilmu disimpan/);
    assert.match(reply, /Nama: Aku/);
    assert.match(reply, /Status: Sibuk/);
    assert.match(reply, /Foto profil: .*fotoprofile\.jpg/);
    assert.match(reply, /Video profil: .*videoprofile\.mp4/);
    assert.match(reply, /Foto cover: .*fotocover\.jpg/);
    assert.match(reply, /Video cover: .*videocover\.mp4/);
    assert.match(reply, /tab recovery/);
  });

  it("tidak ada foto/video sama sekali: tetap dibalas dan snapshot tersimpan, tanpa menyimpan media", async () => {
    const profileViewer = new FakeViewer();
    const coverViewer = new FakeViewer();
    const statusProvider = new FakeStatusProvider();
    statusProvider.status = "";
    const mediaStore = new FakeStore();
    const snapshotStore = new FakeSnapshotStore();
    const service = new SaveProfile({ profileViewer, coverViewer, statusProvider, mediaStore, snapshotStore, selfId: SELF });

    const message = new FakeMessage();
    await service.run("", message);

    assert.deepEqual(mediaStore.saved, []);
    assert.match(message.replies[0]!, /Status: \(kosong\)/);
    assert.match(message.replies[0]!, /Tidak punya foto\/video profil maupun cover/);
    assert.deepEqual(snapshotStore.saved[0], {
      name: "Aku",
      statusMessage: "",
      profileImagePath: null,
      profileVideoPath: null,
      coverImagePath: null,
      coverVideoPath: null,
      savedAt: snapshotStore.saved[0]!.savedAt,
    });
  });

  it("cover/status gagal diambil: tetap lanjut pakai info profil saja", async () => {
    const profileViewer = new FakeViewer();
    profileViewer.picture = { name: "Aku", image: buf("foto-profil"), video: null };
    const coverViewer = new FakeViewer();
    coverViewer.fail = true;
    const statusProvider = new FakeStatusProvider();
    statusProvider.fail = true;
    const mediaStore = new FakeStore();
    const snapshotStore = new FakeSnapshotStore();
    const service = new SaveProfile({ profileViewer, coverViewer, statusProvider, mediaStore, snapshotStore, selfId: SELF });

    const message = new FakeMessage();
    await service.run("", message);

    assert.deepEqual(mediaStore.saved, [{ data: "foto-profil", kind: "fotoprofile" }]);
    assert.match(message.replies[0]!, /Status: \(kosong\)/);
  });

  it("profil sendiri gagal diambil: error diteruskan, tidak macet", async () => {
    const profileViewer = new FakeViewer();
    profileViewer.fail = true;
    const service = new SaveProfile({
      profileViewer,
      coverViewer: new FakeViewer(),
      statusProvider: new FakeStatusProvider(),
      mediaStore: new FakeStore(),
      snapshotStore: new FakeSnapshotStore(),
      selfId: SELF,
    });

    await assert.rejects(service.run("", new FakeMessage()), /gagal ambil profil/);
  });
});
