import type { ChatMessage } from "../domain/chat.ts";
import type { MediaProcessor, MediaSender, ProfileViewer } from "../domain/ports.ts";

export interface ProfilePicturesDeps {
  viewer: ProfileViewer;
  sender: MediaSender;
  media: MediaProcessor;
  /** Id akun sendiri, untuk `tab tpp me`. */
  selfId: string;
  /** Batas jumlah orang sekali perintah, default 3. */
  maxTargets?: number;
  /** Video profil lebih besar dari ini tidak dikirim, default 50 MB. */
  maxVideoBytes?: number;
}

const USER_ID_PATTERN = /\bu[0-9a-f]{32}\b/g;
const DEFAULT_MAX_TARGETS = 3;
const DEFAULT_MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** `tab tpp [me | @orang | id]`: kirim foto profil (dan video profil kalau ada) ke chat ini. */
export class ProfilePictures {
  private readonly maxTargets: number;
  private readonly maxVideoBytes: number;

  constructor(private readonly deps: ProfilePicturesDeps) {
    this.maxTargets = deps.maxTargets ?? DEFAULT_MAX_TARGETS;
    this.maxVideoBytes = deps.maxVideoBytes ?? DEFAULT_MAX_VIDEO_BYTES;
  }

  async show(args: string, message: ChatMessage): Promise<void> {
    const targets = this.resolveTargets(args, message);
    if (targets.length === 0) {
      return message.reply("Pakai: tab tpp @orang (mention), tab tpp me, atau tab tpp <id pengguna>.\nDi chat pribadi, tab tpp saja menampilkan foto lawan bicara.");
    }

    for (const userId of targets.slice(0, this.maxTargets)) {
      await this.showOne(userId, message);
    }
    if (targets.length > this.maxTargets) {
      await message.reply(`Hanya ${this.maxTargets} orang pertama yang diproses.`);
    }
  }

  private resolveTargets(args: string, message: ChatMessage): string[] {
    if (args.trim().toLowerCase() === "me") return [this.deps.selfId];

    const ids = [...new Set([...message.mentionedIds, ...(args.match(USER_ID_PATTERN) ?? [])])];
    if (ids.length > 0) return ids;
    return !args.trim() && !message.isGroupChat ? [message.chatId] : [];
  }

  private async showOne(userId: string, message: ChatMessage): Promise<void> {
    const { viewer, sender, media } = this.deps;
    const { name, image, video } = await viewer.fetchPicture(userId);

    if (!image && !video) return message.reply(`${name} tidak punya foto profil.`);

    const sendVideo = video !== null && video.length <= this.maxVideoBytes;
    await message.reply(`📸 Foto profil ${name}${video ? (sendVideo ? " + video profil" : " (video terlalu besar, tidak dikirim)") : ""}`);
    if (image) await sender.sendImage(message.chatId, image);
    if (video && sendVideo) await sender.sendVideo(message.chatId, video, await media.videoDurationMs(video));
  }
}
