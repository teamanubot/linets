import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FileMediaStore } from "./file-media-store.ts";

describe("FileMediaStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "linebot-media-store-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("menebak ekstensi dari isinya", async () => {
    const store = new FileMediaStore(dir);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]);
    const path = await store.save(jpg, "image");
    assert.match(path, /\.jpg$/);
  });

  it("beberapa save() bersamaan (Promise.all) tidak saling menimpa walau dipanggil di milidetik yang sama", async () => {
    const store = new FileMediaStore(dir);
    const buffers = [Buffer.from("satu"), Buffer.from("dua"), Buffer.from("tiga"), Buffer.from("empat")];
    const paths = await Promise.all(buffers.map((data) => store.save(data, "image")));

    assert.equal(new Set(paths).size, paths.length, "tiap panggilan harus dapat path yang unik");
    assert.equal((await readdir(dir)).length, paths.length, "tiap berkas benar-benar tersimpan, tidak ada yang tertimpa");
  });
});
