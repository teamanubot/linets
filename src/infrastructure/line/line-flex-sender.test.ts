import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client } from "@tab/linets";
import { describeFlexError, LineFlexSender } from "./line-flex-sender.ts";

const LIFF = "2012143545-DtbO6HNI";

function fakeClient(shareMessage: (to: string, message: unknown) => Promise<unknown>) {
  const calls: { defaultLiffId: string[]; shared: Array<{ to: string; message: unknown }> } = { defaultLiffId: [], shared: [] };
  const client = {
    liff: {
      setDefaultLiffId: (id: string) => void calls.defaultLiffId.push(id),
      shareMessage: async (to: string, message: unknown) => {
        calls.shared.push({ to, message });
        return shareMessage(to, message);
      },
    },
  } as unknown as Client;
  return { client, calls };
}

describe("LineFlexSender", () => {
  it("mengatur LIFF id lebih dulu lalu mengirim pesan bertipe flex ke chat tujuan", async () => {
    const { client, calls } = fakeClient(async () => ({ status: "ok" }));
    await new LineFlexSender(client).send("cG1", LIFF, "Judul", { type: "bubble" });

    assert.deepEqual(calls.defaultLiffId, [LIFF]);
    assert.deepEqual(calls.shared, [{ to: "cG1", message: { type: "flex", altText: "Judul", contents: { type: "bubble" } } }]);
  });

  it("INVALID_RECEIVER: dijelaskan sebagai chat dengan diri sendiri", async () => {
    const error = Object.assign(new Error("Failed to send Liff message: Bad Request"), { data: { message: "(code: INVALID_RECEIVER) receiver is invalid" } });
    const { client } = fakeClient(async () => Promise.reject(error));

    await assert.rejects(new LineFlexSender(client).send("uSELF", LIFF, "x", {}), /chat dengan diri sendiri \(Notes\)/);
  });
});

describe("batas kecepatan", () => {
  it("rate limit sesaat: dicoba ulang sekali lalu berhasil", async () => {
    let calls = 0;
    const { client } = fakeClient(async () => {
      if (++calls === 1) throw Object.assign(new Error("Failed to send Liff message: Too Many Requests"), { data: { message: "RateLimit has exceeded" } });
      return { status: "ok" };
    });

    await new LineFlexSender(client, 1).send("cG1", LIFF, "x", {});
    assert.equal(calls, 2);
  });

  it("rate limit terus-menerus: pesan ramah setelah satu kali coba ulang", async () => {
    let calls = 0;
    const { client } = fakeClient(async () => {
      calls++;
      throw Object.assign(new Error("Too Many Requests"), { data: { message: "RateLimit has exceeded" } });
    });

    await assert.rejects(new LineFlexSender(client, 1).send("cG1", LIFF, "x", {}), /membatasi kecepatan kirim Flex/);
    assert.equal(calls, 2);
  });

  it("error lain tidak dicoba ulang", async () => {
    let calls = 0;
    const { client } = fakeClient(async () => {
      calls++;
      throw new Error("jaringan putus");
    });

    await assert.rejects(new LineFlexSender(client, 1).send("cG1", LIFF, "x", {}), /jaringan putus/);
    assert.equal(calls, 1);
  });
});

describe("describeFlexError", () => {
  it("gagal token LIFF: memberi daftar yang perlu diperiksa", () => {
    const message = describeFlexError(new Error(`Failed to get LiffToken: ${LIFF}@cG1`), LIFF).message;
    assert.match(message, /Published/);
    assert.match(message, new RegExp(LIFF));
  });

  it("error lain: menyertakan pesan server bila ada", () => {
    const withDetail = Object.assign(new Error("Bad Request"), { data: { message: "invalid flex" } });
    assert.match(describeFlexError(withDetail, LIFF).message, /invalid flex/);
    assert.match(describeFlexError(new Error("jaringan putus"), LIFF).message, /jaringan putus/);
  });
});
