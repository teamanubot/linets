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

  it("GIF diubah jadi APNG yang berulang tanpa henti, frame tetap, dan lebar dibatasi", async () => {
    const apng = await convertToInfiniteApng(await makeGif(), { maxWidth: 100, fps: 10 });
    const info = readApngInfo(apng);

    assert.ok(info, "hasil harus APNG");
    assert.equal(info.plays, 0);
    assert.ok(info.frames >= 8, `frame: ${info.frames}`);
    assert.equal(apng.readUInt32BE(16), 100); // lebar di IHDR
  });

  it("gambar yang lebih kecil dari lebar maksimum tidak diperbesar", async () => {
    const apng = await convertToInfiniteApng(await makeGif(), { maxWidth: 480 });
    assert.equal(apng.readUInt32BE(16), 160);
  });
});
