import type { PeopleDirectory, ProfileViewer, UserPicture } from "../../domain/ports.ts";
import type { LineCoverGateway } from "./line-cover-gateway.ts";

/** Foto/video cover orang lain, lewat endpoint "LINE Home" yang sama dipakai untuk mengganti cover sendiri. */
export class LineCoverViewer implements ProfileViewer {
  constructor(
    private readonly cover: LineCoverGateway,
    private readonly people: PeopleDirectory,
  ) {}

  async fetchPicture(userId: string): Promise<UserPicture> {
    const [name, info] = await Promise.all([this.people.displayName(userId), this.cover.fetchCoverInfo(userId)]);
    if (!info.coverObsInfo) return { name, image: null, video: null };

    const [image, video] = await Promise.all([
      this.cover.downloadMedia("c", info.coverObsInfo),
      info.videoCoverObsInfo ? this.cover.downloadMedia("vc", info.videoCoverObsInfo) : Promise.resolve(null),
    ]);
    return { name, image, video };
  }
}
