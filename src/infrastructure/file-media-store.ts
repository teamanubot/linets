import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MediaStore } from "../domain/ports.ts";

/** Tebak ekstensi dari byte awal file; kalau tidak dikenali, pakai default sesuai jenis media. */
function detectExtension(data: Buffer, kind: "image" | "video"): string {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png";
  if (data.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (data.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
  return kind === "image" ? "jpg" : "mp4";
}

/** Simpan media ke folder lokal (default `./downloads`). */
export class FileMediaStore implements MediaStore {
  constructor(private readonly directory = "./downloads") {}

  async save(data: Buffer, kind: "image" | "video"): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${Date.now()}.${detectExtension(data, kind)}`);
    await writeFile(path, data);
    return path;
  }
}
