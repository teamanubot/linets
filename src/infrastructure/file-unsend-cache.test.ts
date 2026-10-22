import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FileUnsendCache } from "./file-unsend-cache.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("FileUnsendCache", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "linebot-unsend-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("put lalu take: data/jenis/nama berkas kembali sama, dan sekali pakai (take kedua null)", async () => {
    const cache = new FileUnsendCache({ dir, autoCleanup: false });
    await cache.put("m1", { kind: "file", data: Buffer.from("isinya"), filename: "berkas.pdf" });

    const taken = await cache.take("m1");
    assert.deepEqual(taken, { kind: "file", filename: "berkas.pdf", data: Buffer.from("isinya") });
    assert.equal(await cache.take("m1"), null);
  });

  it("id yang belum pernah disimpan: null", async () => {
    const cache = new FileUnsendCache({ dir, autoCleanup: false });
    assert.equal(await cache.take("tidak-ada"), null);
  });

  it("berkas di atas batas ukuran: dilewati diam-diam, tidak pernah tersimpan", async () => {
    const cache = new FileUnsendCache({ dir, autoCleanup: false, maxItemBytes: 5 });
    await cache.put("besar", { kind: "image", data: Buffer.from("lebih dari lima byte") });
    assert.equal(await cache.take("besar"), null);
  });

  it("sudah lewat masa simpan: take mengembalikan null (dan berkasnya ikut terhapus)", async () => {
    const cache = new FileUnsendCache({ dir, autoCleanup: false, ttlMs: 10 });
    await cache.put("basi", { kind: "image", data: Buffer.from("x") });
    await sleep(30);

    assert.equal(await cache.take("basi"), null);
    assert.deepEqual(await readdir(dir), []);
  });

  it("removeExpired: hanya menghapus yang sudah lewat masa simpan", async () => {
    const cache = new FileUnsendCache({ dir, autoCleanup: false, ttlMs: 10 });
    await cache.put("basi", { kind: "image", data: Buffer.from("x") });
    await sleep(30);
    await cache.put("baru", { kind: "image", data: Buffer.from("y") });

    const removed = await cache.removeExpired();
    assert.equal(removed, 1);
    assert.equal(await cache.take("basi"), null);
    assert.deepEqual((await cache.take("baru"))?.data, Buffer.from("y"));
  });

  it("removeExpired pada direktori yang belum pernah dibuat: tidak error, mengembalikan 0", async () => {
    const cache = new FileUnsendCache({ dir: join(dir, "belum-ada"), autoCleanup: false });
    assert.equal(await cache.removeExpired(), 0);
  });
});
