/**
 * Ubah GIF jadi APNG yang berputar tanpa henti, untuk latar Flex gaya `latar`.
 *
 * Pakai: npx tsx scripts/gif-to-apng.ts <url-atau-file.gif> [lebar-maks=480] [fps=12] [batas-KB=285]
 *        npx tsx scripts/gif-to-apng.ts <sumber> --tetap=LEBAR,FPS,WARNA   (pengaturan tetap, mis. --tetap=280,8,28)
 *
 * Batas animasi Flex adalah 300 KB: APNG yang lebih besar TIDAK diputar (tampil diam). Karena itu batas bawaannya 285 KB.
 * Hasil: folder ./apng-out/<nama>.png. Unggah file itu ke tempat yang bisa diakses lewat https (mis. repo GitHub, lalu pakai
 * link raw.githubusercontent.com), lalu pakai URL-nya: tab flex Judul | Isi | gaya:latar | gif:https://...
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { convertToInfiniteApng, encodeApng, FLEX_ANIMATED_MAX_BYTES, readApngInfo, type ApngResult } from "../src/infrastructure/ffmpeg/apng.ts";

const fixed = process.argv.find((arg) => arg.startsWith("--tetap="))?.slice("--tetap=".length);
const [source, maxWidth = "480", fps = "12", limitKb = "285"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!source) {
  console.error("Pakai: npx tsx scripts/gif-to-apng.ts <url-atau-file.gif> [lebar-maks=480] [fps=12] [batas-KB=285]  atau  --tetap=LEBAR,FPS,WARNA");
  process.exit(1);
}

const isUrl = /^https?:\/\//i.test(source);
const input = isUrl ? Buffer.from(await (await fetch(source)).arrayBuffer()) : await readFile(source);
const name = basename(new URL(isUrl ? source : `file://${source}`).pathname, extname(source.split("?")[0]!)) || "hasil";

async function convert(): Promise<ApngResult> {
  if (!fixed) return convertToInfiniteApng(input, { maxWidth: Number(maxWidth), fps: Number(fps), maxBytes: Number(limitKb) * 1000 });

  const [width, rate, colors] = fixed.split(",").map(Number) as [number, number, number];
  const data = await encodeApng(input, { width, fps: rate, colors });
  const info = readApngInfo(data);
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20), frames: info?.frames ?? 0, plays: info?.plays ?? -1, fits: data.length <= FLEX_ANIMATED_MAX_BYTES, settings: { width, fps: rate, colors } };
}

const result = await convert();
await mkdir("apng-out", { recursive: true });
const path = join("apng-out", `${name}.png`);
await writeFile(path, result.data);

const { width, height, frames, plays, settings } = result;
console.log(`Tersimpan: ${path} (${(result.data.length / 1024).toFixed(0)} KB, ${width}x${height}, ${frames} frame, ${plays === 0 ? "berulang tanpa henti" : `${plays} putaran`})`);
console.log(`Pengaturan: lebar ${settings.width}, ${settings.fps} fps, ${settings.colors} warna`);
const divisor = gcd(width, height);
console.log(`Rasio untuk gaya latar: rasio:${width / divisor}:${height / divisor}`);
if (result.data.length > 300_000) console.warn(`⚠️ ${(result.data.length / 1000).toFixed(0)} KB melebihi batas 300 KB: Flex TIDAK akan memutar animasinya (tampil diam). Kecilkan lebar/fps/warna atau pendekkan GIF-nya.`);
else if (!result.fits) console.warn(`⚠️ Di atas batas aman ${limitKb} KB (tapi masih di bawah 300 KB).`);

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
