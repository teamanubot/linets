import { FileStorage } from "@tab/linets/storage";
import { AntiUnsend } from "./application/anti-unsend.ts";
import { AutoReply } from "./application/auto-reply.ts";
import { AccountService } from "./application/account-service.ts";
import { GroupService } from "./application/group-service.ts";
import { MediaSaver } from "./application/media-saver.ts";
import { ProfileFlow } from "./application/profile-flow.ts";
import { FfmpegMediaProcessor } from "./infrastructure/ffmpeg/ffmpeg-media-processor.ts";
import { FileSettingsStore } from "./infrastructure/file-settings-store.ts";
import { FileMediaStore } from "./infrastructure/file-media-store.ts";
import { login } from "./infrastructure/line/auth.ts";
import { LineCoverGateway } from "./infrastructure/line/line-cover-gateway.ts";
import { LineGroupGateway } from "./infrastructure/line/line-group-gateway.ts";
import { LineNotifier, LinePeopleDirectory } from "./infrastructure/line/line-notifier.ts";
import { LineProfileGateway } from "./infrastructure/line/line-profile-gateway.ts";
import { startLineBot } from "./presentation/line-bot.ts";

const storage = new FileStorage("./.storage.json");
const client = await login(storage);
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

const settings = new FileSettingsStore();
const autoReply = new AutoReply({ store: settings });
const antiUnsend = new AntiUnsend({ store: settings, notifier: new LineNotifier(client), people: new LinePeopleDirectory(client) });
await Promise.all([autoReply.init(), antiUnsend.init()]);

console.log(`Login sebagai ${displayName}`);
startLineBot({ client, profileFlow, coverFlow, account, groups, mediaSaver, autoReply, antiUnsend, displayName });
console.log("Bot berjalan. Tekan Ctrl+C untuk berhenti.");
