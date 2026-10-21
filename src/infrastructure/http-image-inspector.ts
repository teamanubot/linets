import type { ImageFacts, ImageInspector } from "../domain/ports.ts";
import { readApngInfo } from "./ffmpeg/apng.ts";

/** Kepala PNG sampai chunk acTL (penanda APNG) selalu ada di awal file. */
const HEAD_BYTES = 4096;
const TIMEOUT_MS = 8000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Memeriksa gambar lewat HTTP (permintaan Range kecil): ukuran, jenis, dan untuk APNG jumlah putarannya. */
export class HttpImageInspector implements ImageInspector {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async inspect(url: string): Promise<ImageFacts | null> {
    try {
      const response = await this.fetcher(url, {
        headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;

      const head = Buffer.from(await response.arrayBuffer()).subarray(0, HEAD_BYTES);
      return { bytes: totalBytes(response), ...describe(head) };
    } catch {
      return null;
    }
  }
}

/** Ukuran total dari `Content-Range: bytes 0-4095/918202` (206) atau `Content-Length` (200). */
function totalBytes(response: Response): number | undefined {
  const range = /\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  const length = response.status === 206 ? undefined : Number(response.headers.get("content-length"));
  const value = range ? Number(range[1]) : length;
  return Number.isFinite(value) && value! > 0 ? value : undefined;
}

function describe(head: Buffer): Pick<ImageFacts, "kind" | "plays" | "frames"> {
  if (head.subarray(0, 4).toString("latin1") === "GIF8") return { kind: "gif" };
  if (head[0] === 0xff && head[1] === 0xd8) return { kind: "jpeg" };
  if (head.subarray(1, 4).toString("latin1") === "PNG") {
    const info = readApngInfo(head);
    return info ? { kind: "apng", plays: info.plays, frames: info.frames } : { kind: "png" };
  }
  return { kind: "other" };
}
