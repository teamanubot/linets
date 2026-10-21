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
  /** Lebar maksimum (piksel) untuk percobaan pertama; gambar yang lebih kecil tidak diperbesar. Default 480. */
  maxWidth?: number;
  /** Batas frame per detik untuk percobaan pertama. Default 12. */
  fps?: number;
  /** Batas ukuran hasil (byte); pengaturan diturunkan bertahap sampai muat. Default 285.000 (batas animasi Flex 300 KB). */
  maxBytes?: number;
}

export interface ApngSettings {
  width: number;
  fps: number;
  colors: number;
}

export interface ApngResult {
  data: Buffer;
  width: number;
  height: number;
  frames: number;
  /** 0 = berulang tanpa henti. */
  plays: number;
  /** Apakah hasilnya muat di `maxBytes`. */
  fits: boolean;
  settings: ApngSettings;
}

/**
 * Flex tidak memutar gambar beranimasi (`animated: true`) yang lebih dari 300 KB (tampil diam); dokumentasi LINE juga
 * membatasi gambar maksimal 1024x1024 piksel. Dipakai batas aman di bawah 300.000 byte.
 */
export const FLEX_ANIMATED_MAX_BYTES = 285_000;
const DEFAULT_MAX_BYTES = FLEX_ANIMATED_MAX_BYTES;

/** Pengaturan dari kualitas tertinggi ke terendah (lebar relatif terhadap `maxWidth`); tiap langkah dicoba sampai ukuran muat. */
function ladder(maxWidth: number, fps: number): ApngSettings[] {
  const rungs: Array<[factor: number, maxFps: number, colors: number]> = [
    [1, 99, 128],
    [0.9, 12, 96],
    [0.8, 10, 64],
    [0.72, 10, 48],
    [0.65, 8, 40],
    [0.58, 8, 32],
    [0.52, 8, 28],
    [0.46, 8, 24],
    [0.4, 6, 24],
    [0.32, 6, 16],
  ];
  return rungs.map(([factor, maxFps, colors]) => ({ width: Math.max(2, Math.round(maxWidth * factor)), fps: Math.min(fps, maxFps), colors }));
}

/**
 * Ubah GIF (atau video pendek) menjadi APNG yang berulang tanpa henti (`plays 0`). Flex hanya menganimasikan APNG,
 * dan mengikuti jumlah putaran di dalam file: APNG dengan putaran terbatas berhenti setelah beberapa kali.
 *
 * Memakai palet 8-bit (jauh lebih kecil untuk gambar bergerak penuh) dan menurunkan lebar/fps/warna bertahap sampai
 * ukuran muat di `maxBytes`. Kalau tidak ada yang muat, hasil terkecil dikembalikan dengan `fits: false`.
 */
export async function convertToInfiniteApng(input: Buffer, { maxWidth = 480, fps = 12, maxBytes = DEFAULT_MAX_BYTES }: ApngOptions = {}): Promise<ApngResult> {
  let best: ApngResult | null = null;

  for (const settings of ladder(maxWidth, fps)) {
    const data = await encodeApng(input, settings);
    const info = readApngInfo(data);
    const result: ApngResult = {
      data,
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      frames: info?.frames ?? 0,
      plays: info?.plays ?? -1,
      fits: data.length <= maxBytes,
      settings,
    };
    if (!best || data.length < best.data.length) best = result;
    if (result.fits) return result;
  }
  return best!;
}

/** Satu kali encode dengan pengaturan tetap (tanpa mencoba turun bertahap). */
export function encodeApng(input: Buffer, { width, fps, colors }: ApngSettings): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, "input.bin");
    const outputPath = join(dir, "output.png");
    await writeFile(inputPath, input);
    await runFfmpeg([
      "-i", inputPath,
      "-vf",
      // dither "none": jauh lebih kecil untuk APNG (bayer menambah noise yang sulit dikompres)
      `fps=${fps},scale='min(${width},iw)':-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=none`,
      "-pix_fmt", "pal8",
      "-plays", "0",
      "-f", "apng",
      outputPath,
    ]);
    return readFile(outputPath);
  });
}
