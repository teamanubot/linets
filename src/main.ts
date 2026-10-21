import { FileStorage } from "@tab/linets/storage";
import { AntiUnsend } from "./application/anti-unsend.ts";
import { FlexService } from "./application/flex-service.ts";
import { ProfilePictures } from "./application/profile-pictures.ts";
import { YoutubeVideo } from "./application/youtube-video.ts";
import { SpeedTest } from "./application/speed-test.ts";
import { AutoReply } from "./application/auto-reply.ts";
import { AccountService } from "./application/account-service.ts";
import { GroupService } from "./application/group-service.ts";
import { MediaSaver } from "./application/media-saver.ts";
import { ProfileFlow } from "./application/profile-flow.ts";
import { FfmpegMediaProcessor } from "./infrastructure/ffmpeg/ffmpeg-media-processor.ts";
import { FileSettingsStore } from "./infrastructure/file-settings-store.ts";
import { FileMediaStore } from "./infrastructure/file-media-store.ts";
import { login } from "./infrastructure/line/auth.ts";
import { removeStaleDownloads, YtDlpDownloader } from "./infrastructure/yt-dlp-downloader.ts";
import { LineApiProbe } from "./infrastructure/line/line-api-probe.ts";
import { LineCoverGateway } from "./infrastructure/line/line-cover-gateway.ts";
import { LineGroupGateway } from "./infrastructure/line/line-group-gateway.ts";
import { LineNotifier, LinePeopleDirectory } from "./infrastructure/line/line-notifier.ts";
import { LineIdentityProvider } from "./infrastructure/line/line-identity.ts";
import { LineFlexSender } from "./infrastructure/line/line-flex-sender.ts";
import { LineMediaSender } from "./infrastructure/line/line-media-sender.ts";
import { LineProfileViewer } from "./infrastructure/line/line-profile-viewer.ts";
import { LineProfileGateway } from "./infrastructure/line/line-profile-gateway.ts";
import { createConsoleLogger } from "./presentation/logger.ts";
import { LoggingMediaSender, LoggingNotifier } from "./presentation/logging-decorators.ts";
import { startLineBot } from "./presentation/line-bot.ts";

await removeStaleDownloads();
const logger = createConsoleLogger();
// LINE_STORAGE memungkinkan beberapa akun (mis. akun clone untuk uji) dengan file sesi terpisah.
const storage = new FileStorage(process.env.LINE_STORAGE ?? "./.storage.json");
const client = await login(storage).catch((error: Error) => {
  console.error(`\n❌ Login gagal: ${error.message}`);
  process.exit(1);
});
const { displayName } = await client.getMyProfile();

const profile = new LineProfileGateway(client);
const media = new FfmpegMediaProcessor();
const profileFlow = new ProfileFlow({ profile, media });
// Server LINE memotong video cover jadi 15 detik dan memakai gambar potret 9:16.
const coverFlow = new ProfileFlow({
  profile: new LineCoverGateway(client),
  media,
  labels: { still: "cover", video: "video cover" },
  shape: "portrait",
  maxVideoSeconds: 15,
});
const account = new AccountService(profile);
const groups = new GroupService(new LineGroupGateway(client), client.base.profile?.mid ?? "");
const mediaSaver = new MediaSaver(new FileMediaStore());

const people = new LinePeopleDirectory(client);
const settings = new FileSettingsStore();
const autoReply = new AutoReply({ store: settings });
const antiUnsend = new AntiUnsend({ store: settings, notifier: new LoggingNotifier(new LineNotifier(client), logger), people });
const flex = new FlexService({ sender: new LineFlexSender(client), store: settings, identity: new LineIdentityProvider(client) });
await Promise.all([autoReply.init(), antiUnsend.init(), flex.init()]);
const speedTest = new SpeedTest({ probe: new LineApiProbe(client) });
const youtube = new YoutubeVideo({ downloader: new YtDlpDownloader(), profile, media });
const pictures = new ProfilePictures({
  viewer: new LineProfileViewer(client),
  sender: new LoggingMediaSender(new LineMediaSender(client), logger),
  media,
  selfId: client.base.profile?.mid ?? "",
});

console.log(`Login sebagai ${displayName}`);
startLineBot({ client, logger, people, profileFlow, coverFlow, account, groups, mediaSaver, autoReply, antiUnsend, speedTest, youtube, pictures, flex, displayName });
console.log("Bot berjalan. Tekan Ctrl+C untuk berhenti.");
