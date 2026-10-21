import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client } from "@tab/linets";
import { LineIdentityProvider } from "./line-identity.ts";

function fakeClient(profile: { displayName: string; pictureStatus: string }) {
  const calls = { getProfile: 0 };
  const client = {
    base: { talk: { getProfile: async () => (calls.getProfile++, profile) } },
  } as unknown as Client;
  return { client, calls };
}

describe("LineIdentityProvider", () => {
  it("nama dan URL foto profil publik dari pictureStatus", async () => {
    const { client } = fakeClient({ displayName: "Rmun", pictureStatus: "0hABC" });

    assert.deepEqual(await new LineIdentityProvider(client).current(), { name: "Rmun", pictureUrl: "https://profile.line-scdn.net/0hABC" });
  });

  it("tanpa foto profil: hanya nama", async () => {
    const { client } = fakeClient({ displayName: "Rmun", pictureStatus: "" });

    assert.deepEqual(await new LineIdentityProvider(client).current(), { name: "Rmun" });
  });

  it("di-cache beberapa menit, lalu diambil lagi", async () => {
    const { client, calls } = fakeClient({ displayName: "Rmun", pictureStatus: "0hABC" });
    let now = 0;
    const provider = new LineIdentityProvider(client, () => now);

    await provider.current();
    now = 60_000;
    await provider.current();
    assert.equal(calls.getProfile, 1);

    now = 6 * 60_000;
    await provider.current();
    assert.equal(calls.getProfile, 2);
  });
});
