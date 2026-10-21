/**
 * Tes live: MENGUBAH foto profil akun yang tersimpan di .storage.json.
 * Pakai: npx tsx scripts/live-profile-test.ts [detik-video=150]
 * Setelah selesai, pulihkan foto profil secara manual.
 */
import { FileStorage } from "@tab/linets/storage";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runFfmpeg, withTempDir } from "../src/infrastructure/ffmpeg/ffmpeg-media-processor.ts";
import { login } from "../src/infrastructure/line/auth.ts";
import { LineProfileGateway } from "../src/infrastructure/line/line-profile-gateway.ts";

const OBS_BASE_URL = "https://obs.line-scdn.net";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeTestVideo(seconds: number): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const output = join(dir, "test.mp4");
    await runFfmpeg([
      "-f", "lavfi", "-i", `testsrc2=size=480x480:rate=15:duration=${seconds}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "35", "-preset", "veryfast",
      "-movflags", "+faststart", output,
    ]);
    return readFile(output);
  });
}

function makeSolidJpeg(color: string): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const output = join(dir, "solid.jpg");
    await runFfmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=640x640`, "-frames:v", "1", output]);
    return readFile(output);
  });
}

async function download(path: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(`${OBS_BASE_URL}/${path}`)).arrayBuffer());
}

const seconds = Number(process.argv[2] ?? 150);
const client = await login(new FileStorage("./.storage.json"));
const gateway = new LineProfileGateway(client);

async function currentPictureStatus(): Promise<string> {
  return (await client.base.talk.getProfile({ syncReason: "INTERNAL" })).pictureStatus;
}

/** Profil diperbarui server secara asinkron, jadi tunggu sampai kondisi terpenuhi. */
async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 60_000): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 2000) {
    if (await condition()) return true;
    await sleep(2000);
  }
  return false;
}

const video = await makeTestVideo(seconds);
const red = await makeSolidJpeg("red");
const green = await makeSolidJpeg("green");
const video2 = await makeTestVideo(12);
const check = (label: string, ok: boolean) => console.log(`${ok ? "OK  " : "GAGAL"} ${label}`);

// 1. video + gambar merah
await gateway.setVideo(video, red);
await waitUntil(async () => (await download(await currentPictureStatus())).equals(red));
const ps1 = await currentPictureStatus();
check(`video ${seconds}s tersimpan utuh`, (await download(`${ps1}/vp`)).length === video.length);
check("gambar statis = merah", (await download(ps1)).equals(red));

// 2. ganti gambar saja -> video tetap
await gateway.setImageKeepVideo(green);
await waitUntil(async () => (await download(await currentPictureStatus())).equals(green));
const ps2 = await currentPictureStatus();
check("gambar jadi hijau", (await download(ps2)).equals(green));
check("video tidak berubah", (await download(`${ps2}/vp`)).length === video.length);

// 3. ganti video saja -> gambar tetap
await gateway.setVideoKeepImage(video2);
await waitUntil(async () => (await download(`${await currentPictureStatus()}/vp`)).length === video2.length);
const ps3 = await currentPictureStatus();
check("video berubah", (await download(`${ps3}/vp`)).length === video2.length);
check("gambar tetap hijau", (await download(ps3)).equals(green));

process.exit(0);
