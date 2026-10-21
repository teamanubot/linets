/**
 * Tes live: MENGUBAH cover profil akun yang tersimpan di .storage.json, lalu memulihkannya.
 * Pakai: npx tsx scripts/live-cover-test.ts [detik-video=150]
 */
import { FileStorage } from "@tab/linets/storage";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runFfmpeg, withTempDir } from "../src/infrastructure/ffmpeg/ffmpeg-media-processor.ts";
import { login } from "../src/infrastructure/line/auth.ts";
import { LineCoverGateway } from "../src/infrastructure/line/line-cover-gateway.ts";

interface CoverInfo {
  coverObsInfo: { objectId: string };
  videoCoverObsInfo?: { objectId: string } | null;
}

const OBS = "https://obs.line-scdn.net/r/myhome";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const solidJpeg = (color: string) =>
  withTempDir(async (dir) => {
    const out = join(dir, "c.jpg");
    await runFfmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=540x960`, "-frames:v", "1", out]);
    return readFile(out);
  });

const testVideo = (seconds: number) =>
  withTempDir(async (dir) => {
    const out = join(dir, "v.mp4");
    await runFfmpeg([
      "-f", "lavfi", "-i", `testsrc2=size=360x640:rate=15:duration=${seconds}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "35", "-preset", "veryfast", "-movflags", "+faststart", out,
    ]);
    return readFile(out);
  });

const durationOf = (buf: Buffer) =>
  withTempDir(async (dir) => {
    const file = join(dir, "x.mp4");
    await writeFile(file, buf);
    return new Promise<string>((resolve) =>
      execFile(ffmpegInstaller.path, ["-i", file], (_error, _stdout, stderr) => resolve(/Duration: ([\d:.]+)/.exec(stderr)?.[1] ?? "?")),
    );
  });

const download = async (path: string) => Buffer.from(await (await fetch(`${OBS}/${path}`)).arrayBuffer());
const check = (label: string, ok: boolean) => console.log(`${ok ? "OK   " : "GAGAL"} ${label}`);

const seconds = Number(process.argv[2] ?? 150);
const client = await login(new FileStorage("./.storage.json"));
const mid = client.base.profile!.mid;
const gateway = new LineCoverGateway(client);

async function homeCall<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const { channelAccessToken } = await client.base.channel.approveChannelAndIssueChannelToken({ channelId: "1341209850" });
  const response = await client.voomRest<T>({
    path: `/api/v1/home/cover.json${method === "GET" ? `?homeId=${mid}` : ""}`,
    routing: "MYHOME_RENEWAL", method, body, channelToken: channelAccessToken,
    extraHeaders: { "x-lhm": method, "X-Line-Mid": mid, "X-Line-Access": client.authToken },
  });
  if (response.code !== 0) throw new Error(`kode ${response.code}`);
  return response.result as T;
}
const readCover = async () => { await sleep(1500); return homeCall<CoverInfo>("GET"); };

const original = await homeCall<CoverInfo>("GET");
console.log("cover asli:", JSON.stringify(original.coverObsInfo), JSON.stringify(original.videoCoverObsInfo));

try {
  const green = await solidJpeg("green");
  const red = await solidJpeg("red");
  const blue = await solidJpeg("blue");
  const longVideo = await testVideo(seconds);
  const shortVideo = await testVideo(12);

  // Server meng-encode ulang gambar dan memotong video cover jadi 15 detik, jadi bandingkan id dan durasi.
  console.log(`\n1. video ${seconds}s + gambar hijau`);
  await gateway.setVideo(longVideo, green);
  let cover = await readCover();
  const idsAfter1 = { image: cover.coverObsInfo.objectId, video: cover.videoCoverObsInfo?.objectId };
  check("id gambar dan video baru", idsAfter1.image !== original.coverObsInfo.objectId && !!idsAfter1.video && idsAfter1.video !== original.videoCoverObsInfo?.objectId);
  check("gambar statis ada", (await download(`c/${idsAfter1.image}`)).length > 0);
  const stored = idsAfter1.video ? await download(`vc/${idsAfter1.video}`) : Buffer.alloc(0);
  console.log(`   video tersimpan: ${stored.length} B, durasi ${await durationOf(stored)} (diunggah ${seconds}s)`);

  console.log("\n2. ganti gambar saja (merah), video tetap");
  await gateway.setImageKeepVideo(red);
  cover = await readCover();
  check("gambar berubah", cover.coverObsInfo.objectId !== idsAfter1.image);
  check("video tidak berubah", cover.videoCoverObsInfo?.objectId === idsAfter1.video);
  const idsAfter2 = { image: cover.coverObsInfo.objectId };

  console.log("\n3. ganti video saja (12s), gambar tetap");
  await gateway.setVideoKeepImage(shortVideo);
  cover = await readCover();
  check("video berubah", !!cover.videoCoverObsInfo && cover.videoCoverObsInfo.objectId !== idsAfter1.video);
  check("gambar tetap", cover.coverObsInfo.objectId === idsAfter2.image);

  console.log("\n4. gambar biasa (biru) tanpa video");
  await gateway.setImage(blue);
  cover = await readCover();
  check("gambar berubah", cover.coverObsInfo.objectId !== idsAfter2.image);
  check("video cover dihapus", !cover.videoCoverObsInfo && !(await gateway.hasVideo()));
} finally {
  console.log("\nMemulihkan cover asli...");
  await homeCall("POST", {
    homeId: mid, storyShare: false, meta: {},
    coverObjectId: original.coverObsInfo.objectId,
    ...(original.videoCoverObsInfo && { videoCoverObjectId: original.videoCoverObsInfo.objectId }),
  });
  const restored = await readCover();
  console.log("setelah pemulihan:", JSON.stringify(restored.coverObsInfo), JSON.stringify(restored.videoCoverObsInfo));
  check("cover asli kembali", restored.coverObsInfo.objectId === original.coverObsInfo.objectId && restored.videoCoverObsInfo?.objectId === original.videoCoverObsInfo?.objectId);
}
process.exit(0);
