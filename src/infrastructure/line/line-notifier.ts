import type { Client } from "@tab/linets";
import type { Notifier, PeopleDirectory } from "../../domain/ports.ts";

/** Mengirim pemberitahuan ke chat dengan diri sendiri. */
export class LineNotifier implements Notifier {
  constructor(private readonly client: Client) {}

  async notify(text: string): Promise<void> {
    const selfId = this.client.base.profile?.mid;
    if (!selfId) throw new Error("Client belum login (profile.mid kosong)");
    await this.client.sendCompactMessage(selfId, text);
  }
}

const shortId = (userId: string) => `${userId.slice(0, 8)}…`;

/**
 * Nama tampilan pengguna. `getContactsV3` ditolak sesi desktop ("API method not capable"), jadi dicari berurutan lewat:
 * profil sendiri → `getContactsV2` → `getContacts` (V1). Kalau semuanya gagal, dipakai id singkat (tidak disimpan di
 * cache, supaya dicoba lagi lain kali).
 */
export class LinePeopleDirectory implements PeopleDirectory {
  private readonly cache = new Map<string, string>();

  constructor(private readonly client: Client) {}

  async displayName(userId: string): Promise<string> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const name = (await this.lookup(userId)) || null;
    if (!name) return shortId(userId);
    this.cache.set(userId, name);
    return name;
  }

  private async lookup(userId: string): Promise<string | null> {
    const { talk } = this.client.base;
    const attempts: Array<() => Promise<string | null | undefined>> = [
      async () => (userId === this.client.base.profile?.mid ? (await talk.getProfile({ syncReason: "INTERNAL" })).displayName : null),
      async () => {
        const contact = (await talk.getContactsV2({ mids: [userId] })).contacts[userId]?.contact;
        return contact && (contact.displayNameOverridden || contact.displayName);
      },
      async () => {
        const contact = (await talk.getContacts({ mids: [userId] }))[0];
        return contact && (contact.displayNameOverridden || contact.displayName);
      },
    ];

    for (const attempt of attempts) {
      try {
        const name = await attempt();
        if (name) return name;
      } catch {
        // API ini tidak didukung atau gagal; coba cara berikutnya
      }
    }
    return null;
  }
}
