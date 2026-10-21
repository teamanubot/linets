/**
 * Ubah GIF jadi APNG yang berputar tanpa henti, untuk latar Flex gaya `latar`.
 *
 * Pakai: npx tsx scripts/gif-to-apng.ts <url-atau-file.gif> [lebar-maks=480] [fps=12]
 * Hasil: folder ./apng-out/<nama>.png. Unggah file itu ke tempat yang bisa diakses lewat https (mis. repo GitHub, lalu pakai
 * link raw.githubusercontent.com), lalu pakai URL-nya: tab flex Judul | Isi | gaya:latar | gif:https://...
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { convertToInfiniteApng, readApngInfo } from "../src/infrastructure/ffmpeg/apng.ts";

const [source, maxWidth = "480", fps = "12"] = process.argv.slice(2);
if (!source) {
  console.error("Pakai: npx tsx scripts/gif-to-apng.ts <url-atau-file.gif> [lebar-maks=480] [fps=12]");
  process.exit(1);
}

const isUrl = /^https?:\/\//i.test(source);
const input = isUrl ? Buffer.from(await (await fetch(source)).arrayBuffer()) : await readFile(source);
const name = basename(new URL(isUrl ? source : `file://${source}`).pathname, extname(source.split("?")[0]!)) || "hasil";

const output = await convertToInfiniteApng(input, { maxWidth: Number(maxWidth), fps: Number(fps) });
const info = readApngInfo(output);
await mkdir("apng-out", { recursive: true });
const path = join("apng-out", `${name}.png`);
await writeFile(path, output);

console.log(`Tersimpan: ${path} (${(output.length / 1024).toFixed(0)} KB, ${info?.frames ?? 0} frame, ${info?.plays === 0 ? "berulang tanpa henti" : `${info?.plays} putaran`})`);
if (output.length > 1024 * 1024) {
  console.warn("⚠️ Lebih dari 1 MB: LINE bisa menolak atau tidak menganimasikannya. Kecilkan: tambahkan argumen lebar-maks dan fps lebih kecil, mis. 360 8.");
}
