import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FileProfileMediaStore } from "./file-profile-media-store.ts";

describe("FileProfileMediaStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "linebot-profile-media-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("nama berkas baku per jenis", async () => {
    const store = new FileProfileMediaStore(dir);
    assert.match(await store.save("fotoprofile", Buffer.from("a")), /fotoprofile\.jpg$/);
    assert.match(await store.save("videoprofile", Buffer.from("b")), /videoprofile\.mp4$/);
    assert.match(await store.save("fotocover", Buffer.from("c")), /fotocover\.jpg$/);
    assert.match(await store.save("videocover", Buffer.from("d")), /videocover\.mp4$/);
  });

  it("saveprofile berulang menimpa berkas yang sama, tidak menumpuk file baru", async () => {
    const store = new FileProfileMediaStore(dir);
    const path1 = await store.save("fotoprofile", Buffer.from("versi lama"));
    const path2 = await store.save("fotoprofile", Buffer.from("versi baru"));

    assert.equal(path1, path2);
    assert.equal((await readFile(path2, "utf8")), "versi baru");
    assert.deepEqual(await readdir(dir), ["fotoprofile.jpg"]);
  });

  it("empat slot berbeda (lewat Promise.all, seperti tab saveprofile) menghasilkan empat berkas berbeda", async () => {
    const store = new FileProfileMediaStore(dir);
    await Promise.all([
      store.save("fotoprofile", Buffer.from("1")),
      store.save("videoprofile", Buffer.from("2")),
      store.save("fotocover", Buffer.from("3")),
      store.save("videocover", Buffer.from("4")),
    ]);

    assert.deepEqual(new Set(await readdir(dir)), new Set(["fotoprofile.jpg", "videoprofile.mp4", "fotocover.jpg", "videocover.mp4"]));
  });
});
