import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Client } from "@tab/linets";
import { LinePeopleDirectory } from "./line-notifier.ts";

const SELF = "u" + "a".repeat(32);
const BUDI = "u" + "b".repeat(32);

interface Calls {
  profile: number;
  v2: number;
  v1: number;
}

function fakeClient(options: {
  v2?: Record<string, { displayName: string; displayNameOverridden?: string }>;
  v2Throws?: boolean;
  v1?: Record<string, { displayName: string }>;
}) {
  const calls: Calls = { profile: 0, v2: 0, v1: 0 };
  const client = {
    base: {
      profile: { mid: SELF },
      talk: {
        getProfile: async () => (calls.profile++, { displayName: "Rivai Munte" }),
        getContactsV2: async ({ mids }: { mids: string[] }) => {
          calls.v2++;
          if (options.v2Throws) throw new Error("API method not capable");
          return { contacts: Object.fromEntries(mids.filter((mid) => options.v2?.[mid]).map((mid) => [mid, { contact: options.v2![mid] }])) };
        },
        getContacts: async ({ mids }: { mids: string[] }) => (calls.v1++, mids.filter((mid) => options.v1?.[mid]).map((mid) => options.v1![mid])),
      },
    },
  } as unknown as Client;
  return { client, calls };
}

describe("LinePeopleDirectory", () => {
  let setup: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    setup = fakeClient({ v2: { [BUDI]: { displayName: "Budi", displayNameOverridden: "Budi Kantor" } } });
  });

  it("akun sendiri: nama dari profil, tanpa menyentuh API kontak", async () => {
    const people = new LinePeopleDirectory(setup.client);

    assert.equal(await people.displayName(SELF), "Rivai Munte");
    assert.deepEqual(setup.calls, { profile: 1, v2: 0, v1: 0 });
  });

  it("teman: memakai nama panggilan (override) bila ada, dan hasilnya di-cache", async () => {
    const people = new LinePeopleDirectory(setup.client);

    assert.equal(await people.displayName(BUDI), "Budi Kantor");
    assert.equal(await people.displayName(BUDI), "Budi Kantor");
    assert.equal(setup.calls.v2, 1);
  });

  it("V2 gagal: jatuh ke getContacts (V1)", async () => {
    const { client, calls } = fakeClient({ v2Throws: true, v1: { [BUDI]: { displayName: "Budi V1" } } });

    assert.equal(await new LinePeopleDirectory(client).displayName(BUDI), "Budi V1");
    assert.deepEqual([calls.v2, calls.v1], [1, 1]);
  });

  it("tidak ketemu di mana pun: id singkat (bukan id panjang), dan tidak di-cache", async () => {
    const { client, calls } = fakeClient({ v2Throws: true });
    const people = new LinePeopleDirectory(client);

    assert.equal(await people.displayName(BUDI), `${BUDI.slice(0, 8)}…`);
    await people.displayName(BUDI);
    assert.equal(calls.v2, 2);
  });
});
