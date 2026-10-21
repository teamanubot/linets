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

/** Nama tampilan dari kontak LINE; kalau gagal, pakai id-nya. */
export class LinePeopleDirectory implements PeopleDirectory {
  private readonly cache = new Map<string, string>();

  constructor(private readonly client: Client) {}

  async displayName(userId: string): Promise<string> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    try {
      const { responses } = await this.client.base.relation.getContactsV3({ mids: [userId] });
      const name = responses[0]?.targetProfileDetail?.profileName || userId;
      this.cache.set(userId, name);
      return name;
    } catch {
      return userId;
    }
  }
}
