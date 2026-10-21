import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { MediaProcessor } from "../../domain/ports.ts";

const run = promisify(execFile);
const FFMPEG = ffmpegInstaller.path;

/** Potong jadi persegi di tengah lalu perkecil ke 640x640. */
const SQUARE_FILTER = "crop='min(iw,ih)':'min(iw,ih)',scale=640:640";

export async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "linebot-"));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function runFfmpeg(args: string[]): Promise<unknown> {
  return run(FFMPEG, ["-y", ...args]);
}

/** Ambil satu frame dari file media sebagai JPEG persegi. */
function firstFrameAsSquareJpeg(input: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, "input.bin");
    const outputPath = join(dir, "output.jpg");
    await writeFile(inputPath, input);
    await runFfmpeg(["-i", inputPath, "-frames:v", "1", "-vf", SQUARE_FILTER, "-q:v", "3", outputPath]);
    return readFile(outputPath);
  });
}

export class FfmpegMediaProcessor implements MediaProcessor {
  toSquareJpeg(image: Buffer): Promise<Buffer> {
    return firstFrameAsSquareJpeg(image);
  }

  extractSquareFrame(video: Buffer): Promise<Buffer> {
    return firstFrameAsSquareJpeg(video);
  }
}
