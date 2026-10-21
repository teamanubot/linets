import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runFfmpeg, withTempDir } from "./ffmpeg-media-processor.ts";

export interface ApngInfo {
  frames: number;
  /** Jumlah putaran; 0 berarti berulang tanpa henti. */
  plays: number;
}

const PNG_SIGNATURE_LENGTH = 8;

/** Baca chunk `acTL` dari PNG; null kalau bukan APNG (tidak beranimasi). */
export function readApngInfo(data: Buffer): ApngInfo | null {
  let position = PNG_SIGNATURE_LENGTH;
  while (position + 8 <= data.length) {
    const length = data.readUInt32BE(position);
    const type = data.toString("latin1", position + 4, position + 8);
    if (type === "acTL") return { frames: data.readUInt32BE(position + 8), plays: data.readUInt32BE(position + 12) };
    if (type === "IDAT") return null; // acTL harus sebelum IDAT
    position += 12 + length;
  }
  return null;
}

export interface ApngOptions {
  /** Lebar maksimum (piksel); gambar yang lebih kecil tidak diperbesar. Default 480. */
  maxWidth?: number;
  /** Batas frame per detik. Default 12. */
  fps?: number;
}

/**
 * Ubah GIF (atau video pendek) menjadi APNG yang berulang tanpa henti (`plays 0`). Flex hanya menganimasikan APNG,
 * dan mengikuti jumlah putaran di dalam file: APNG dengan putaran terbatas berhenti setelah beberapa kali.
 */
export function convertToInfiniteApng(input: Buffer, { maxWidth = 480, fps = 12 }: ApngOptions = {}): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, "input.bin");
    const outputPath = join(dir, "output.png");
    await writeFile(inputPath, input);
    await runFfmpeg([
      "-i", inputPath,
      "-vf", `fps=${fps},scale='min(${maxWidth},iw)':-2:flags=lanczos`,
      "-plays", "0",
      "-f", "apng",
      outputPath,
    ]);
    return readFile(outputPath);
  });
}
