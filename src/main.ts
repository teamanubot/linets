import { FileStorage } from "@evex/linejs/storage";
import { ProfileFlow } from "./application/profile-flow.ts";
import { FfmpegMediaProcessor } from "./infrastructure/ffmpeg/ffmpeg-media-processor.ts";
import { login } from "./infrastructure/line/auth.ts";
import { LineProfileGateway } from "./infrastructure/line/line-profile-gateway.ts";
import { startLineBot } from "./presentation/line-bot.ts";

const storage = new FileStorage("./.storage.json");
const client = await login(storage);
const { displayName } = await client.getMyProfile();

const profileFlow = new ProfileFlow({
  profile: new LineProfileGateway(client),
  media: new FfmpegMediaProcessor(),
});

console.log(`Login sebagai ${displayName}`);
startLineBot({ client, profileFlow, displayName });
console.log("Bot berjalan. Tekan Ctrl+C untuk berhenti.");
