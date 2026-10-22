import type { Client } from "@tab/linets";
import type { PictureGateway } from "../../domain/ports.ts";

/** Channel "LINE Home" (timeline/profil). */
const HOME_CHANNEL_ID = "1341209850";
const COVER_PATH = "/api/v1/home/cover.json";

export interface ObsInfo {
  objectId: string;
}

export interface CoverInfo {
  coverObsInfo?: ObsInfo | null;
  videoCoverObsInfo?: ObsInfo | null;
}

const toBlob = (data: Buffer, type: string) => new Blob([new Uint8Array(data)], { type });

/**
 * Cover profil (sampul): gambar statis di `myhome/c/{id}` dan video opsional di `myhome/vc/{id}`.
 * Keduanya dikaitkan ke profil lewat `cover.json` dengan `coverObjectId` dan `videoCoverObjectId` (id polos;
 * akhiran `/vp` dari CHRLINE sudah usang dan membuat server menjawab 500).
 *
 * Token channel harus lewat `approveChannelAndIssueChannelToken`. Token dari `issueChannelToken`
 * (yang dipakai `client.voom` di LINEJS) ditolak gateway dengan 401.
 */
export class LineCoverGateway implements PictureGateway {
  constructor(private readonly client: Client) {}

  async hasVideo(): Promise<boolean> {
    return Boolean((await this.readCover()).videoCoverObsInfo);
  }

  async setImage(jpg: Buffer): Promise<void> {
    const imageId = await this.uploadImage(jpg);
    await this.writeCover({ coverObjectId: imageId });
  }

  async setImageKeepVideo(jpg: Buffer): Promise<void> {
    const { videoCoverObsInfo } = await this.readCover();
    const imageId = await this.uploadImage(jpg);
    await this.writeCover({
      coverObjectId: imageId,
      ...(videoCoverObsInfo && { videoCoverObjectId: videoCoverObsInfo.objectId }),
    });
  }

  async setVideo(video: Buffer, image: Buffer): Promise<void> {
    const imageId = await this.uploadImage(image);
    const videoId = await this.uploadVideo(video);
    await this.writeCover({ coverObjectId: imageId, videoCoverObjectId: videoId });
  }

  async setVideoKeepImage(video: Buffer): Promise<void> {
    const { coverObsInfo } = await this.readCover();
    if (!coverObsInfo) throw new Error("Belum ada cover; kirim gambar dulu (tab cp) sebelum video saja (tab cv2).");
    const videoId = await this.uploadVideo(video);
    await this.writeCover({ coverObjectId: coverObsInfo.objectId, videoCoverObjectId: videoId });
  }

  private get mid(): string {
    const mid = this.client.base.profile?.mid;
    if (!mid) throw new Error("Client belum login (profile.mid kosong)");
    return mid;
  }

  private async channelToken(): Promise<string> {
    const issued = await this.client.base.channel.approveChannelAndIssueChannelToken({ channelId: HOME_CHANNEL_ID });
    return issued.channelAccessToken;
  }

  private async home<T>(method: "GET" | "POST", token: string, path: string, body?: unknown): Promise<T> {
    const response = await this.client.voomRest<T>({
      path,
      routing: "MYHOME_RENEWAL",
      method,
      body,
      channelToken: token,
      extraHeaders: { "x-lhm": method, "X-Line-Mid": this.mid, "X-Line-Access": this.client.authToken },
    });
    if (response.code !== 0 || response.result === null) {
      throw new Error(`Cover ditolak server (kode ${response.code}${response.message ? `: ${response.message}` : ""})`);
    }
    return response.result;
  }

  private async readCover(): Promise<CoverInfo> {
    return this.fetchCoverInfo(this.mid);
  }

  /** Info cover (gambar + video kalau ada) milik siapa pun, bukan hanya akun sendiri. Dipakai oleh `LineCoverViewer`. */
  async fetchCoverInfo(userId: string): Promise<CoverInfo> {
    return this.home<CoverInfo>("GET", await this.channelToken(), `${COVER_PATH}?homeId=${userId}`);
  }

  /** Unduh gambar/video cover dari `myhome/c/{id}` atau `myhome/vc/{id}`. Dipakai oleh `LineCoverViewer`. */
  async downloadMedia(namespace: "c" | "vc", info: ObsInfo): Promise<Buffer> {
    const blob = await this.client.base.obs.downloadObjectForService({
      obsPath: `myhome/${namespace}`,
      oid: info.objectId,
      addHeaders: { "X-Line-ChannelToken": await this.channelToken() },
    });
    return Buffer.from(await blob.arrayBuffer());
  }

  private async writeCover(ids: { coverObjectId: string; videoCoverObjectId?: string }): Promise<void> {
    await this.home("POST", await this.channelToken(), COVER_PATH, {
      homeId: this.mid,
      storyShare: false,
      meta: {},
      ...ids,
    });
  }

  private async uploadImage(jpg: Buffer): Promise<string> {
    return this.upload("c", "image", toBlob(jpg, "image/jpeg"), "cover.jpg");
  }

  private async uploadVideo(video: Buffer): Promise<string> {
    return this.upload("vc", "video", toBlob(video, "video/mp4"), "cover.mp4");
  }

  private async upload(namespace: "c" | "vc", type: "image" | "video", data: Blob, filename: string): Promise<string> {
    const objectId = crypto.randomUUID().replaceAll("-", "");
    const { objId } = await this.client.base.obs.uploadObjectForService({
      data,
      oType: type,
      obsPath: `myhome/${namespace}/${objectId}`,
      filename,
      addHeaders: { "X-Line-ChannelToken": await this.channelToken() },
    });
    if (!objId) throw new Error("Upload cover ditolak server LINE (kemungkinan file terlalu besar).");
    return objId;
  }
}
