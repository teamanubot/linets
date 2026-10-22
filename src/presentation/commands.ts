import type { AntiUnsend } from "../application/anti-unsend.ts";
import type { AutoReply } from "../application/auto-reply.ts";
import type { AccountService } from "../application/account-service.ts";
import type { GroupService } from "../application/group-service.ts";
import type { SpeedTest } from "../application/speed-test.ts";
import type { ProfilePictures } from "../application/profile-pictures.ts";
import type { YoutubeVideo } from "../application/youtube-video.ts";
import type { FlexService } from "../application/flex-service.ts";
import type { MediaSaver } from "../application/media-saver.ts";
import type { FlowName, ProfileFlow } from "../application/profile-flow.ts";
import type { MediaDownloader } from "../application/media-downloader.ts";
import type { MediaSearch } from "../application/media-search.ts";
import type { ChatMessage } from "../domain/chat.ts";
import { helpCard, renderHelp } from "./help.ts";

export const COMMAND_PREFIX = "tab";

/** Mulai satu alur; alur lain yang sedang berjalan dibatalkan supaya media tidak salah sasaran. */
function startFlow(flow: ProfileFlow, other: ProfileFlow, name: FlowName, message: ChatMessage): Promise<void> {
  other.cancel();
  return flow.start(name, message);
}

export type Command = (args: string, message: ChatMessage) => Promise<void>;

export interface CommandDeps {
  profileFlow: ProfileFlow;
  coverFlow: ProfileFlow;
  account: AccountService;
  groups: GroupService;
  mediaSaver: MediaSaver;
  autoReply: AutoReply;
  antiUnsend: AntiUnsend;
  speedTest: SpeedTest;
  youtube: YoutubeVideo;
  pictures: ProfilePictures;
  flex: FlexService;
  downloader: MediaDownloader;
  search: MediaSearch;
  displayName: string;
}

export function createCommands({
  profileFlow,
  coverFlow,
  account,
  groups,
  mediaSaver,
  autoReply,
  antiUnsend,
  speedTest,
  youtube,
  pictures,
  flex,
  downloader,
  search,
  displayName,
}: CommandDeps): Record<string, Command> {
  return {
    help: (args, message) => flex.sendHelp(helpCard(args), renderHelp(args), message),
    ping: (_args, message) => message.reply("pong 🏓"),
    speed: (_args, message) => speedTest.run(message),
    echo: (args, message) => message.reply(args || "(kosong)"),
    me: (_args, message) => message.reply(`Nama: ${displayName}`),
    pp: (_args, message) => startFlow(profileFlow, coverFlow, "pp", message),
    vp: (_args, message) => startFlow(profileFlow, coverFlow, "vp", message),
    vp2: (_args, message) => startFlow(profileFlow, coverFlow, "vp2", message),
    vpl: (args, message) => youtube.setAsProfileVideo(args, message),
    "dl-ig": (args, message) => downloader.run(args, message, "instagram"),
    "dl-tiktok": (args, message) => downloader.run(args, message, "tiktok"),
    "dl-facebook": (args, message) => downloader.run(args, message, "facebook"),
    "dl-twitter": (args, message) => downloader.run(args, message, "twitter"),
    "dl-yt": (args, message) => downloader.run(args, message, "youtube"),
    "dl-ytmp3": (args, message) => downloader.run(args, message, "youtube", true),
    "search-yt": (args, message) => search.search("youtube", args, message),
    "search-tiktok": (args, message) => search.search("tiktok", args, message),
    lanjut: (_args, message) => search.next(message),
    pilih: (args, message) => search.pick(args, message),
    tpp: (args, message) => pictures.show(args, message),
    flex: (args, message) => flex.sendCard(args, message),
    flexjson: (args, message) => flex.sendJson(args, message),
    flexgaya: (args, message) => flex.configureStyle(args, message),
    flexgaleri: (args, message) => flex.sendGallery(args, message),
    liff: (args, message) => flex.configureLiff(args, message),
    cp: (_args, message) => startFlow(coverFlow, profileFlow, "pp", message),
    cv: (_args, message) => startFlow(coverFlow, profileFlow, "vp", message),
    cv2: (_args, message) => startFlow(coverFlow, profileFlow, "vp2", message),
    nama: (args, message) => account.setName(args, message),
    status: (args, message) => account.setStatus(args, message),
    save: (_args, message) => mediaSaver.saveReplied(message),
    linkgrup: (_args, message) => groups.createLink(message),
    join: (args, message) => groups.join(args, message),
    namagrup: (args, message) => groups.rename(args, message),
    invite: (args, message) => groups.invite(args, message),
    tendang: (_args, message) => groups.kick(message),
    keluar: (args, message) => groups.leave(args, message),
    kickall: (_args, message) => groups.kickAll(_args, message),
    autoreply: (args, message) => autoReply.configure(args, message),
    antiunsend: (args, message) => antiUnsend.configure(args, message),
    batal: async (_args, message) => {
      profileFlow.cancel();
      coverFlow.cancel();
      await message.reply("Dibatalkan.");
    },
  };
}

/** Pecah "tab <nama> [argumen]"; null kalau pesan bukan perintah. */
export function parseCommand(text: string): { name: string; args: string } | null {
  const [prefix, name, ...rest] = text.trim().split(/\s+/);
  if (prefix?.toLowerCase() !== COMMAND_PREFIX || !name) return null;
  return { name: name.toLowerCase(), args: rest.join(" ") };
}
