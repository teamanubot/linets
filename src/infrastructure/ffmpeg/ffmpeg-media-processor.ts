import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ImageShape, MediaProcessor } from "../../domain/ports.ts";

const run = promisify(execFile);
const FFMPEG = ffmpegInstaller.path;

/** Potong di tengah sesuai rasio lalu perkecil: persegi 640x640 atau potret 9:16 540x960. */
const SHAPE_FILTER: Record<ImageShape, string> = {
  square: "crop='min(iw,ih)':'min(iw,ih)',scale=640:640",
  portrait: "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=540:960",
};

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

/** Ambil satu frame dari file media sebagai JPEG. */
function firstFrameAsJpeg(input: Buffer, shape: ImageShape): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, "input.bin");
    const outputPath = join(dir, "output.jpg");
    await writeFile(inputPath, input);
    await runFfmpeg(["-i", inputPath, "-frames:v", "1", "-vf", SHAPE_FILTER[shape], "-q:v", "3", outputPath]);
    return readFile(outputPath);
  });
}

export class FfmpegMediaProcessor implements MediaProcessor {
  toJpeg(image: Buffer, shape: ImageShape): Promise<Buffer> {
    return firstFrameAsJpeg(image, shape);
  }

  extractFrame(video: Buffer, shape: ImageShape): Promise<Buffer> {
    return firstFrameAsJpeg(video, shape);
  }

  trimVideo(video: Buffer, maxSeconds: number): Promise<Buffer> {
    return withTempDir(async (dir) => {
      const inputPath = join(dir, "input.mp4");
      const outputPath = join(dir, "output.mp4");
      await writeFile(inputPath, video);
      await runFfmpeg(["-i", inputPath, "-t", String(maxSeconds), "-c", "copy", "-movflags", "+faststart", outputPath]);
      return readFile(outputPath);
    });
  }
}
