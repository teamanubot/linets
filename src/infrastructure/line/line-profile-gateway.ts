import type { Client } from "@evex/linejs";
import type { ProfileGateway } from "../../domain/ports.ts";

const OBS_BASE_URL = "https://obs.line-scdn.net";

const toBlob = (data: Buffer, type: string) => new Blob([new Uint8Array(data)], { type });

/**
 * Foto profil lewat OBS (penyimpanan objek LINE).
 *
 * Server hanya menerapkan video + gambar sebagai satu paket: upload gambar tanpa video
 * menghapus video, dan upload video tanpa gambar tidak berlaku. Karena itu mengganti
 * salah satunya berarti mengunduh pasangan yang ada lalu mengupload ulang bersama yang baru.
 */
export class LineProfileGateway implements ProfileGateway {
  constructor(private readonly client: Client) {}

  async hasVideo(): Promise<boolean> {
    return Boolean((await this.fetchProfile()).videoProfile);
  }

  async setImage(jpg: Buffer): Promise<void> {
    await this.client.uploadMyProfileImage(toBlob(jpg, "image/jpeg"));
  }

  async setImageKeepVideo(jpg: Buffer): Promise<void> {
    const { pictureStatus } = await this.fetchProfile();
    const currentVideo = await this.download(`${pictureStatus}/vp`);
    await this.setVideo(currentVideo, jpg);
  }

  async setVideo(video: Buffer, image: Buffer): Promise<void> {
    const mid = this.requireMid();
    // `cat=vp.mp4` memberi tahu server bahwa profil ini punya video.
    const params = { cat: "vp.mp4" };
    const addHeaders = {
      "X-Talk-Meta": Buffer.from(JSON.stringify({ profileContext: { storyShare: false } })).toString("base64"),
    };

    // Video lebih dulu: gambar yang masuk belakangan yang "mengunci" perubahan profil.
    await this.client.base.obs.uploadObjectForService({
      data: toBlob(video, "video/mp4"),
      oType: "video",
      obsPath: `talk/vp/${mid}`,
      params,
      filename: "profile.mp4",
      addHeaders,
    });
    await this.client.base.obs.uploadObjectForService({
      data: toBlob(image, "image/jpeg"),
      oType: "image",
      obsPath: `talk/p/${mid}`,
      params,
      filename: "profile.jpg",
      addHeaders,
    });
  }

  async setVideoKeepImage(video: Buffer): Promise<void> {
    const { pictureStatus } = await this.fetchProfile();
    const currentImage = await this.download(pictureStatus);
    await this.setVideo(video, currentImage);
  }

  /** getMyProfile() ter-cache; talk.getProfile selalu ambil dari server. */
  private fetchProfile() {
    return this.client.base.talk.getProfile({ syncReason: "INTERNAL" });
  }

  private requireMid(): string {
    const mid = this.client.base.profile?.mid;
    if (!mid) throw new Error("Client belum login (profile.mid kosong)");
    return mid;
  }

  private async download(path: string): Promise<Buffer> {
    const response = await fetch(`${OBS_BASE_URL}/${path}`);
    if (!response.ok) throw new Error(`Gagal mengunduh media profil (HTTP ${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
}
