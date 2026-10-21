import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client } from "@tab/linets";
import { LineGroupGateway } from "./line-group-gateway.ts";

function rateLimitError() {
  return Object.assign(new Error("RateLimit"), { data: { message: "RateLimit" } });
}

function fakeClient(options: { memberMids?: Record<string, number>; kickResults?: Record<string, "ok" | "fail" | "rate-limit-once"> } = {}) {
  const kicked: string[] = [];
  const kickCallsInFlight = new Set<string>();
  const concurrentPeaks: number[] = [];
  const peaksByUser: Record<string, number> = {};
  const rateLimited = new Set<string>();

  const chat = {
    raw: { extra: { groupExtra: { memberMids: options.memberMids ?? {} } } },
    async kick(userId: string) {
      kickCallsInFlight.add(userId);
      concurrentPeaks.push(kickCallsInFlight.size);
      peaksByUser[userId] = kickCallsInFlight.size;
      await Promise.resolve(); // biarkan panggilan lain (dalam gelombang yang sama) mulai juga
      kickCallsInFlight.delete(userId);

      const mode = options.kickResults?.[userId] ?? "ok";
      if (mode === "fail") throw new Error(`gagal menendang ${userId}`);
      if (mode === "rate-limit-once" && !rateLimited.has(userId)) {
        rateLimited.add(userId);
        throw rateLimitError();
      }
      kicked.push(userId);
    },
  };
  const client = { getChat: async () => chat } as unknown as Client;
  return { client, kicked, concurrentPeaks, peaksByUser };
}

describe("LineGroupGateway", () => {
  it("members: id anggota dari groupExtra.memberMids", async () => {
    const { client } = fakeClient({ memberMids: { ua: 1, ub: 2 } });
    assert.deepEqual(await new LineGroupGateway(client).members("cG1"), ["ua", "ub"]);
  });

  it("members: grup tanpa data anggota → kosong, tidak error", async () => {
    const { client } = fakeClient();
    assert.deepEqual(await new LineGroupGateway(client).members("cG1"), []);
  });

  it("kick: terus ke orang berikutnya walau satu gagal; berhasil kalau minimal satu orang tertendang", async () => {
    const { client, kicked } = fakeClient({ kickResults: { ua: "fail", ub: "ok", uc: "ok" } });
    await new LineGroupGateway(client, { kickBatchPauseMs: 0 }).kick("cG1", ["ua", "ub", "uc"]);
    assert.deepEqual(new Set(kicked), new Set(["ub", "uc"]));
  });

  it("kick: melempar error hanya kalau SEMUA target gagal", async () => {
    const { client } = fakeClient({ kickResults: { ua: "fail", ub: "fail" } });
    await assert.rejects(new LineGroupGateway(client, { kickBatchPauseMs: 0 }).kick("cG1", ["ua", "ub"]), /gagal menendang u[ab]/);
  });

  it("kick: daftar target kosong tidak melempar error", async () => {
    const { client } = fakeClient();
    await new LineGroupGateway(client).kick("cG1", []);
  });

  it("kick: dikirim per gelombang paralel (bukan satu-satu), dibatasi kickConcurrency", async () => {
    const userIds = Array.from({ length: 7 }, (_, i) => `u${i}`);
    const { client, kicked, concurrentPeaks } = fakeClient();
    await new LineGroupGateway(client, { kickConcurrency: 3, kickBatchPauseMs: 0 }).kick("cG1", userIds);

    assert.deepEqual(new Set(kicked), new Set(userIds));
    assert.ok(Math.max(...concurrentPeaks) >= 2, "harus ada permintaan yang tumpang tindih, bukan sekuensial penuh");
    assert.ok(Math.max(...concurrentPeaks) <= 3, "tidak boleh melebihi kickConcurrency");
  });

  it("kick: kena RateLimit pada satu target → tunggu lalu coba sekali lagi, akhirnya berhasil", async () => {
    const { client, kicked } = fakeClient({ kickResults: { ua: "rate-limit-once", ub: "ok" } });
    await new LineGroupGateway(client, { kickBatchPauseMs: 0, kickRateLimitBackoffMs: 5 }).kick("cG1", ["ua", "ub"]);
    assert.deepEqual(new Set(kicked), new Set(["ua", "ub"]));
  });

  it("kick: gelombang yang kena RateLimit membuat gelombang BERIKUTNYA otomatis diperkecil (dibagi dua)", async () => {
    const rateLimited = ["ua", "ub", "uc", "ud"]; // gelombang pertama, konkurensi 4
    const afterwards = ["ue", "uf", "ug", "uh"]; // diproses setelah diperkecil ke konkurensi 2
    const kickResults = Object.fromEntries([
      ...rateLimited.map((id) => [id, "rate-limit-once" as const]),
      ...afterwards.map((id) => [id, "ok" as const]),
    ]);
    const { client, kicked, concurrentPeaks, peaksByUser } = fakeClient({ kickResults });

    await new LineGroupGateway(client, { kickConcurrency: 4, kickBatchPauseMs: 0, kickRateLimitBackoffMs: 1 }).kick("cG1", [
      ...rateLimited,
      ...afterwards,
    ]);

    assert.deepEqual(new Set(kicked), new Set([...rateLimited, ...afterwards]));
    assert.equal(Math.max(...concurrentPeaks), 4, "gelombang pertama tetap sempat mencapai konkurensi penuh");
    for (const id of afterwards) {
      assert.ok(peaksByUser[id]! <= 2, `${id} seharusnya diproses di gelombang yang sudah diperkecil (≤2), dapat ${peaksByUser[id]}`);
    }
  });
});
