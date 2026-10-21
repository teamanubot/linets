import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ImageShape, MediaProcessor, SquareVideoMode, SquareVideoOptions } from "../../domain/ports.ts";

const run = promisify(execFile);
const FFMPEG = ffmpegInstaller.path;

/** Potong di tengah sesuai rasio lalu perkecil: persegi 640x640 atau potret 9:16 540x960. */
const SHAPE_FILTER: Record<ImageShape, string> = {
  square: "crop='min(iw,ih)':'min(iw,ih)',scale=640:640",
  portrait: "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=540:960",
};

/** `fit`: seluruh gambar di tengah dengan latar dari video yang sama diburamkan. `crop`: potong tengah. */
function squareVideoFilter(mode: SquareVideoMode, side: number, limitFps: boolean): string {
  const fps = limitFps ? "fps=30," : "";
  if (mode === "crop") {
    return `[0:v]${fps}scale=${side}:${side}:force_original_aspect_ratio=increase,crop=${side}:${side},format=yuv420p[v]`;
  }
  return (
    `[0:v]${fps}split=2[bg][fg];` +
    `[bg]scale=${side}:${side}:force_original_aspect_ratio=increase,crop=${side}:${side},boxblur=20:2[blurred];` +
    `[fg]scale=${side}:${side}:force_original_aspect_ratio=decrease[inside];` +
    `[blurred][inside]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`
  );
}

/** Keluaran stderr `ffmpeg -i` (selalu error karena tanpa output); berisi durasi dan fps. */
async function probeStderr(path: string): Promise<string> {
  return run(FFMPEG, ["-i", path]).then(
    (result) => result.stderr,
    (error: { stderr?: string }) => error.stderr ?? "",
  );
}

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

  videoDurationMs(video: Buffer): Promise<number> {
    return withTempDir(async (dir) => {
      const inputPath = join(dir, "input.mp4");
      await writeFile(inputPath, video);
      // `ffmpeg -i` tanpa keluaran selalu berakhir error, durasinya ada di stderr.
      const stderr = await run(FFMPEG, ["-i", inputPath]).then(
        (result) => result.stderr,
        (error: { stderr?: string }) => error.stderr ?? "",
      );
      const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      if (!match) throw new Error("Durasi video tidak terbaca.");
      return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
    });
  }

  async toSquareVideo(inputPath: string, { mode, side, videoKbps }: SquareVideoOptions): Promise<Buffer> {
    // Frame rate di atas 30 fps pada 1440p/2160p membutuhkan H.264 level 5.2 yang tidak semua HP bisa putar.
    const fps = Number(/, ([\d.]+) fps/.exec(await probeStderr(inputPath))?.[1] ?? 0);
    const limitFps = side >= 1440 && fps > 30;

    return withTempDir(async (dir) => {
      const outputPath = join(dir, "output.mp4");
      await runFfmpeg([
        "-i", inputPath,
        "-filter_complex", squareVideoFilter(mode, side, limitFps),
        "-map", "[v]", "-map", "0:a?",
        // CRF menjaga kualitas; maxrate/bufsize menjaga ukuran file di bawah batas upload.
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-maxrate", `${videoKbps}k`, "-bufsize", `${videoKbps * 2}k`,
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        outputPath,
      ]);
      return readFile(outputPath);
    });
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
