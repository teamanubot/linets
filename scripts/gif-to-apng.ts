/**
 * Ubah GIF jadi APNG yang berputar tanpa henti, untuk latar Flex gaya `latar`.
 *
 * Pakai: npx tsx scripts/gif-to-apng.ts <url-atau-file.gif> [lebar-maks=480] [fps=12] [batas-KB=950]
 * Hasil: folder ./apng-out/<nama>.png. Unggah file itu ke tempat yang bisa diakses lewat https (mis. repo GitHub, lalu pakai
 * link raw.githubusercontent.com), lalu pakai URL-nya: tab flex Judul | Isi | gaya:latar | gif:https://...
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { convertToInfiniteApng, readApngInfo } from "../src/infrastructure/ffmpeg/apng.ts";

const [source, maxWidth = "480", fps = "12", limitKb = "950"] = process.argv.slice(2);
if (!source) {
  console.error("Pakai: npx tsx scripts/gif-to-apng.ts <url-atau-file.gif> [lebar-maks=480] [fps=12] [batas-KB=950]");
  process.exit(1);
}

const isUrl = /^https?:\/\//i.test(source);
const input = isUrl ? Buffer.from(await (await fetch(source)).arrayBuffer()) : await readFile(source);
const name = basename(new URL(isUrl ? source : `file://${source}`).pathname, extname(source.split("?")[0]!)) || "hasil";

const result = await convertToInfiniteApng(input, { maxWidth: Number(maxWidth), fps: Number(fps), maxBytes: Number(limitKb) * 1024 });
await mkdir("apng-out", { recursive: true });
const path = join("apng-out", `${name}.png`);
await writeFile(path, result.data);

const { width, height, frames, plays, settings } = result;
console.log(`Tersimpan: ${path} (${(result.data.length / 1024).toFixed(0)} KB, ${width}x${height}, ${frames} frame, ${plays === 0 ? "berulang tanpa henti" : `${plays} putaran`})`);
console.log(`Pengaturan: lebar ${settings.width}, ${settings.fps} fps, ${settings.colors} warna`);
const divisor = gcd(width, height);
console.log(`Rasio untuk gaya latar: rasio:${width / divisor}:${height / divisor}`);
if (!result.fits) console.warn(`⚠️ Masih di atas ${limitKb} KB. Coba lebar-maks atau fps lebih kecil, atau potong GIF-nya lebih pendek.`);

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
