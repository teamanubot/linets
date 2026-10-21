import type { Client } from "@tab/linets";
import type { IdentityProvider, SelfIdentity } from "../../domain/ports.ts";

const PICTURE_BASE_URL = "https://profile.line-scdn.net";
const CACHE_MS = 5 * 60_000;

/** Nama tampilan dan URL foto profil publik akun sendiri (di-cache beberapa menit). */
export class LineIdentityProvider implements IdentityProvider {
  private cached: { value: SelfIdentity; at: number } | null = null;

  constructor(
    private readonly client: Client,
    private readonly now: () => number = Date.now,
  ) {}

  async current(): Promise<SelfIdentity> {
    if (this.cached && this.now() - this.cached.at < CACHE_MS) return this.cached.value;

    // getMyProfile() ter-cache; talk.getProfile selalu ambil dari server.
    const profile = await this.client.base.talk.getProfile({ syncReason: "INTERNAL" });
    const value: SelfIdentity = {
      name: profile.displayName,
      ...(profile.pictureStatus ? { pictureUrl: `${PICTURE_BASE_URL}/${profile.pictureStatus}` } : {}),
    };
    this.cached = { value, at: this.now() };
    return value;
  }
}
