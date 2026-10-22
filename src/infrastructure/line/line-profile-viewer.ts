import type { Client } from "@tab/linets";
import type { ProfileStatusProvider, ProfileViewer, UserPicture } from "../../domain/ports.ts";

const PICTURE_BASE_URL = "https://profile.line-scdn.net";

async function download(url: string): Promise<Buffer | null> {
  const response = await fetch(url);
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

/**
 * Foto/video profil dari profil LINE. `getContactsV3` ditolak sesi desktop ("API method not capable"),
 * jadi teman dan orang lain dibaca lewat `getContactsV2`.
 */
export class LineProfileViewer implements ProfileViewer, ProfileStatusProvider {
  constructor(private readonly client: Client) {}

  async fetchPicture(userId: string): Promise<UserPicture> {
    const { name, pictureStatus, videoProfile } = await this.readProfile(userId);
    if (!pictureStatus) return { name, image: null, video: null };

    const [image, video] = await Promise.all([
      download(`${PICTURE_BASE_URL}/${pictureStatus}`),
      videoProfile ? download(`${PICTURE_BASE_URL}/${pictureStatus}/vp`) : null,
    ]);
    return { name, image, video };
  }

  /** Status message (teks di bawah nama profil), untuk `tab saveprofile`. */
  async statusMessage(userId: string): Promise<string> {
    return (await this.readProfile(userId)).statusMessage;
  }

  private async readProfile(userId: string): Promise<{ name: string; statusMessage: string; pictureStatus: string; videoProfile: string }> {
    if (userId === this.client.base.profile?.mid) {
      // getMyProfile() ter-cache; talk.getProfile selalu ambil dari server.
      const me = await this.client.base.talk.getProfile({ syncReason: "INTERNAL" });
      return { name: me.displayName, statusMessage: me.statusMessage ?? "", pictureStatus: me.pictureStatus, videoProfile: me.videoProfile };
    }

    const { contacts } = await this.client.base.talk.getContactsV2({ mids: [userId] });
    const contact = contacts[userId]?.contact;
    if (!contact) throw new Error("Profil pengguna itu tidak ditemukan.");
    return {
      name: contact.displayNameOverridden || contact.displayName,
      statusMessage: contact.statusMessage ?? "",
      pictureStatus: contact.pictureStatus,
      videoProfile: contact.videoProfile,
    };
  }
}
