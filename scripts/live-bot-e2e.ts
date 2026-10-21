/**
 * Tes live end-to-end: mengirim perintah `tab ...` beserta gambar/video ke chat sendiri dan memeriksa
 * hasilnya di cover dan foto profil. MENGUBAH akun di .storage.json lalu memulihkannya.
 *
 * Pakai: npx tsx scripts/live-bot-e2e.ts <folder-kerja> <foto-profil-asli.jpg>
 */
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { FileStorage } from "@tab/linets/storage";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AccountService } from "../src/application/account-service.ts";
import { AntiUnsend } from "../src/application/anti-unsend.ts";
import { FlexService } from "../src/application/flex-service.ts";
import { ProfilePictures } from "../src/application/profile-pictures.ts";
import { YoutubeVideo } from "../src/application/youtube-video.ts";
import { SpeedTest } from "../src/application/speed-test.ts";
import { AutoReply } from "../src/application/auto-reply.ts";
import { GroupService } from "../src/application/group-service.ts";
import { MediaSaver } from "../src/application/media-saver.ts";
import { ProfileFlow } from "../src/application/profile-flow.ts";
import { FfmpegMediaProcessor, runFfmpeg, withTempDir } from "../src/infrastructure/ffmpeg/ffmpeg-media-processor.ts";
import { FileMediaStore } from "../src/infrastructure/file-media-store.ts";
import { FileSettingsStore } from "../src/infrastructure/file-settings-store.ts";
import { login } from "../src/infrastructure/line/auth.ts";
import { YtDlpDownloader } from "../src/infrastructure/yt-dlp-downloader.ts";
import { LineApiProbe } from "../src/infrastructure/line/line-api-probe.ts";
import { LineCoverGateway } from "../src/infrastructure/line/line-cover-gateway.ts";
import { LineGroupGateway } from "../src/infrastructure/line/line-group-gateway.ts";
import { LineNotifier, LinePeopleDirectory } from "../src/infrastructure/line/line-notifier.ts";
import { LineFlexSender } from "../src/infrastructure/line/line-flex-sender.ts";
import { LineMediaSender } from "../src/infrastructure/line/line-media-sender.ts";
import { LineProfileViewer } from "../src/infrastructure/line/line-profile-viewer.ts";
import { LineProfileGateway } from "../src/infrastructure/line/line-profile-gateway.ts";
import { startLineBot } from "../src/presentation/line-bot.ts";

const [workDir, originalProfilePath] = [process.argv[2], process.argv[3]];
if (!workDir || !originalProfilePath) throw new Error("Pakai: live-bot-e2e.ts <folder-kerja> <foto-profil-asli.jpg>");

const client = await login(new FileStorage("./.storage.json"));
const mid = client.base.profile!.mid;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const settings = new FileSettingsStore(join(workDir, "settings-test.json"));
const profile = new LineProfileGateway(client);
const media = new FfmpegMediaProcessor();
const autoReply = new AutoReply({ store: settings });
const antiUnsend = new AntiUnsend({ store: settings, notifier: new LineNotifier(client), people: new LinePeopleDirectory(client) });
await Promise.all([autoReply.init(), antiUnsend.init()]);
startLineBot({
  client,
  people: new LinePeopleDirectory(client),
  displayName: "uji",
  profileFlow: new ProfileFlow({ profile, media }),
  coverFlow: new ProfileFlow({
    profile: new LineCoverGateway(client),
    media,
    labels: { still: "cover", video: "video cover" },
    shape: "portrait",
    maxVideoSeconds: 15,
  }),
  account: new AccountService(profile),
  groups: new GroupService(new LineGroupGateway(client), mid),
  mediaSaver: new MediaSaver(new FileMediaStore(join(workDir, "downloads"))),
  autoReply,
  antiUnsend,
  speedTest: new SpeedTest({ probe: new LineApiProbe(client) }),
  youtube: new YoutubeVideo({ downloader: new YtDlpDownloader(), profile, media }),
  flex: new FlexService({ sender: new LineFlexSender(client), store: settings }),
  pictures: new ProfilePictures({ viewer: new LineProfileViewer(client), sender: new LineMediaSender(client), media, selfId: mid }),
});

const replies: string[] = [];
client.on("message", (message) => {
  if (message.text && !message.text.startsWith("tab ")) replies.push(message.text);
});

const solidJpeg = (color: string) =>
  withTempDir(async (dir) => {
    const out = join(dir, "a.jpg");
    await runFfmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=720x720`, "-frames:v", "1", out]);
    return readFile(out);
  });
const testVideo = (seconds: number) =>
  withTempDir(async (dir) => {
    const out = join(dir, "a.mp4");
    await runFfmpeg(["-f", "lavfi", "-i", `testsrc2=size=480x480:rate=15:duration=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "35", out]);
    return readFile(out);
  });
const durationOf = (buf: Buffer) =>
  withTempDir(async (dir) => {
    const file = join(dir, "x.mp4");
    await writeFile(file, buf);
    return new Promise<string>((resolve) =>
      execFile(ffmpegInstaller.path, ["-i", file], (_e, _o, stderr) => resolve(/Duration: ([\d:.]+)/.exec(stderr)?.[1] ?? "?")),
    );
  });

const sendImage = (data: Buffer) => client.base.obs.uploadObjTalk(mid, "image", new Blob([new Uint8Array(data)]), undefined, "a.jpg");
const sendVideo = (data: Buffer, ms: number) => client.base.obs.uploadObjTalk(mid, "video", new Blob([new Uint8Array(data)]), undefined, "a.mp4", ms);
const say = async (text: string) => {
  await client.sendCompactMessage(mid, text);
  await sleep(2500);
};
const show = (label: string) => console.log(label, "->", replies.splice(0).join(" | ") || "(TIDAK ADA BALASAN)");
const download = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());

const { channelAccessToken: token } = await client.base.channel.approveChannelAndIssueChannelToken({ channelId: "1341209850" });
const coverHeaders = (method: string) => ({ "x-lhm": method, "X-Line-Mid": mid, "X-Line-Access": client.authToken });
const readCover = async () =>
  (await client.voomRest<any>({ path: `/api/v1/home/cover.json?homeId=${mid}`, routing: "MYHOME_RENEWAL", method: "GET", channelToken: token, extraHeaders: coverHeaders("GET") })).result;
const readProfile = () => client.base.talk.getProfile({ syncReason: "INTERNAL" });

await sleep(3000);
const coverBefore = await readCover();
console.log("awal -> foto profil punya video:", Boolean((await readProfile()).videoProfile));
try {
  console.log("\n=== COVER ===");
  await say("tab cp"); show("tab cp");
  await sendImage(await solidJpeg("red")); await sleep(9000); show("  kirim gambar");
  let cover = await readCover();
  console.log("  gambar berubah:", cover.coverObsInfo.objectId !== coverBefore.coverObsInfo.objectId, "| video tetap:", cover.videoCoverObsInfo?.objectId === coverBefore.videoCoverObsInfo?.objectId);

  await say("tab cv"); show("tab cv");
  await sendImage(await solidJpeg("green")); await sleep(5000); show("  kirim gambar");
  await sendVideo(await testVideo(60), 60000); await sleep(20000); show("  kirim video 60s");
  cover = await readCover();
  const storedCover = cover.videoCoverObsInfo ? await download(`https://obs.line-scdn.net/r/myhome/vc/${cover.videoCoverObsInfo.objectId}`) : Buffer.alloc(0);
  console.log("  video baru:", cover.videoCoverObsInfo?.objectId !== coverBefore.videoCoverObsInfo?.objectId, "| durasi tersimpan:", await durationOf(storedCover));

  await say("tab cv2"); show("tab cv2");
  const imageId = cover.coverObsInfo.objectId, videoId = cover.videoCoverObsInfo?.objectId;
  await sendVideo(await testVideo(10), 10000); await sleep(15000); show("  kirim video 10s");
  cover = await readCover();
  console.log("  gambar tetap:", cover.coverObsInfo.objectId === imageId, "| video berubah:", cover.videoCoverObsInfo?.objectId !== videoId);

  console.log("\n=== FOTO PROFIL ===");
  await say("tab vp"); show("tab vp");
  await sendImage(await solidJpeg("blue")); await sleep(5000); show("  kirim gambar");
  await sendVideo(await testVideo(150), 150000); await sleep(25000); show("  kirim video 150s");
  await sleep(3000);
  let current = await readProfile();
  const storedProfile = current.videoProfile ? await download(`https://obs.line-scdn.net/${current.pictureStatus}/vp`) : Buffer.alloc(0);
  console.log("  ada video:", Boolean(current.videoProfile), "| durasi video profil:", await durationOf(storedProfile));

  await say("tab pp"); show("tab pp");
  const pictureBefore = current.pictureStatus;
  await sendImage(await solidJpeg("yellow")); await sleep(15000); show("  kirim gambar");
  current = await readProfile();
  console.log("  gambar berubah:", current.pictureStatus !== pictureBefore, "| video tetap ada:", Boolean(current.videoProfile));
} finally {
  const restored = await client.voomRest<any>({
    path: "/api/v1/home/cover.json", routing: "MYHOME_RENEWAL", method: "POST", channelToken: token, extraHeaders: coverHeaders("POST"),
    body: { homeId: mid, storyShare: false, meta: {}, coverObjectId: coverBefore.coverObsInfo.objectId, videoCoverObjectId: coverBefore.videoCoverObsInfo?.objectId },
  });
  await sleep(2000);
  const after = await readCover();
  console.log("\npemulihan cover:", restored.code, "| asli kembali:", after.coverObsInfo.objectId === coverBefore.coverObsInfo.objectId && after.videoCoverObsInfo?.objectId === coverBefore.videoCoverObsInfo?.objectId);
  await profile.setImage(await readFile(originalProfilePath));
  await sleep(8000);
  console.log("pemulihan foto profil: video dihapus:", !(await readProfile()).videoProfile);
}
process.exit(0);
