import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MediaSaver } from "./media-saver.ts";
import { FakeMessage, FakeStore } from "./test-doubles.ts";

describe("MediaSaver", () => {
  it("menyimpan media dari pesan yang di-reply", async () => {
    const store = new FakeStore();
    const target = new FakeMessage({ mediaKind: "video", data: "klip" });
    const message = new FakeMessage({ replied: target });
    await new MediaSaver(store).saveReplied(message);

    assert.deepEqual(store.saved, [{ data: "klip", kind: "video" }]);
    assert.match(message.replies[0]!, /Tersimpan.*file-1/);
  });

  it("bukan reply: beri petunjuk", async () => {
    const store = new FakeStore();
    const message = new FakeMessage();
    await new MediaSaver(store).saveReplied(message);

    assert.deepEqual(store.saved, []);
    assert.match(message.replies[0]!, /Reply ke gambar\/video/);
  });

  it("reply ke pesan teks: ditolak", async () => {
    const store = new FakeStore();
    const message = new FakeMessage({ replied: new FakeMessage() });
    await new MediaSaver(store).saveReplied(message);

    assert.deepEqual(store.saved, []);
    assert.match(message.replies[0]!, /bukan gambar\/video/);
  });
});
