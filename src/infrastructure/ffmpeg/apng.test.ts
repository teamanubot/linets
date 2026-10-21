import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { convertToInfiniteApng, readApngInfo } from "./apng.ts";
import { runFfmpeg, withTempDir } from "./ffmpeg-media-processor.ts";

/** GIF animasi kecil (10 frame, 160x120) buatan ffmpeg. */
const makeGif = () =>
  withTempDir(async (dir) => {
    const out = join(dir, "a.gif");
    await runFfmpeg(["-f", "lavfi", "-i", "testsrc2=size=160x120:rate=10:duration=1", out]);
    return readFile(out);
  });

describe("APNG", () => {
  it("readApngInfo: PNG biasa bukan APNG; sampah diabaikan", () => {
    assert.equal(readApngInfo(Buffer.from("bukan png")), null);
  });

  it("GIF diubah jadi APNG tak terbatas dengan palet 8-bit, frame tetap, dan lebar dibatasi", async () => {
    const result = await convertToInfiniteApng(await makeGif(), { maxWidth: 100, fps: 10 });

    assert.equal(result.plays, 0);
    assert.equal(readApngInfo(result.data)?.plays, 0);
    assert.ok(result.frames >= 8, `frame: ${result.frames}`);
    assert.equal(result.width, 100);
    assert.equal(result.height, 76); // 160x120 -> 100x75 (dibulatkan genap)
    assert.equal(result.data[25], 3, "tipe warna PNG harus 3 (berpalet)");
    assert.ok(result.fits);
  });

  it("gambar yang lebih kecil dari lebar maksimum tidak diperbesar", async () => {
    const result = await convertToInfiniteApng(await makeGif(), { maxWidth: 480 });
    assert.equal(result.width, 160);
  });

  it("batas ukuran terlalu kecil: pengaturan diturunkan bertahap, hasil terkecil dikembalikan dengan fits false", async () => {
    const gif = await makeGif();
    const normal = await convertToInfiniteApng(gif, { maxWidth: 160, fps: 10 });
    const squeezed = await convertToInfiniteApng(gif, { maxWidth: 160, fps: 10, maxBytes: 1 });

    assert.equal(squeezed.fits, false);
    assert.ok(squeezed.data.length < normal.data.length, `${squeezed.data.length} < ${normal.data.length}`);
    assert.ok(squeezed.settings.width < normal.settings.width);
    assert.equal(squeezed.plays, 0);
  });
});
