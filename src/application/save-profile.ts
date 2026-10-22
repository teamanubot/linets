import type { ChatMessage } from "../domain/chat.ts";
import type { ProfileMediaStore, ProfileSnapshotStore, ProfileStatusProvider, ProfileViewer } from "../domain/ports.ts";

export interface SaveProfileDeps {
  profileViewer: ProfileViewer;
  coverViewer: ProfileViewer;
  statusProvider: ProfileStatusProvider;
  /** Nama berkasnya baku (fotoprofile.jpg dst.) dan selalu menimpa yang lama, tidak menumpuk file baru. */
  mediaStore: ProfileMediaStore;
  snapshotStore: ProfileSnapshotStore;
  /** Id akun sendiri; `tab saveprofile` selalu menyimpan profil akun sendiri, bukan orang lain. */
  selfId: string;
}

/**
 * `tab saveprofile`: simpan nama, status, foto/video profil, dan foto/video cover akun sendiri.
 * Disimpan juga sebagai satu snapshot yang bisa dipulihkan lagi lewat `tab recovery`.
 */
export class SaveProfile {
  constructor(private readonly deps: SaveProfileDeps) {}

  async run(_args: string, message: ChatMessage): Promise<void> {
    const { profileViewer, coverViewer, statusProvider, mediaStore, snapshotStore, selfId } = this.deps;
    const [profile, cover, statusMessage] = await Promise.all([
      profileViewer.fetchPicture(selfId),
      coverViewer.fetchPicture(selfId).catch(() => ({ name: "", image: null, video: null })),
      statusProvider.statusMessage(selfId).catch(() => ""),
    ]);

    const [profileImagePath, profileVideoPath, coverImagePath, coverVideoPath] = await Promise.all([
      profile.image ? mediaStore.save("fotoprofile", profile.image) : null,
      profile.video ? mediaStore.save("videoprofile", profile.video) : null,
      cover.image ? mediaStore.save("fotocover", cover.image) : null,
      cover.video ? mediaStore.save("videocover", cover.video) : null,
    ]);

    await snapshotStore.save({ name: profile.name, statusMessage, profileImagePath, profileVideoPath, coverImagePath, coverVideoPath, savedAt: Date.now() });

    const saved = [
      profileImagePath && `Foto profil: ${profileImagePath}`,
      profileVideoPath && `Video profil: ${profileVideoPath}`,
      coverImagePath && `Foto cover: ${coverImagePath}`,
      coverVideoPath && `Video cover: ${coverVideoPath}`,
    ].filter((line): line is string => Boolean(line));

    const lines = [`✅ Profilmu disimpan`, `Nama: ${profile.name}`, `Status: ${statusMessage || "(kosong)"}`, ...saved];
    if (saved.length === 0) lines.push("(Tidak punya foto/video profil maupun cover.)");
    lines.push("Pakai tab recovery untuk mengembalikan profil ke ini lagi nanti.");
    await message.reply(lines.join("\n"));
  }
}
