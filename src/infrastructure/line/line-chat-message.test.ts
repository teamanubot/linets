import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LineChatMessage } from "./line-chat-message.ts";
import type { LineMessageResolver } from "./line-message-resolver.ts";

function errorWithCode(code: string) {
  return Object.assign(new Error(code), { data: { code } });
}

function fakeMessage(replySequence: string[]) {
  const calls: unknown[] = [];
  let attempt = 0;
  const message = {
    raw: { id: "m1" },
    from: { id: "u1" },
    to: { id: "cG1", type: "GROUP" },
    text: "halo",
    isMyMessage: true,
    async reply(input: unknown) {
      calls.push(input);
      const result = replySequence[attempt++];
      if (result !== "ok") throw errorWithCode(result!);
    },
  };
  return { message, calls };
}

function resolverWith(registerCalls: string[]) {
  return {
    getClient: () => ({
      base: {
        e2ee: {
          tryRegisterE2EEGroupKey: async (chatMid: string) => {
            registerCalls.push(chatMid);
          },
        },
      },
    }),
  } as unknown as LineMessageResolver;
}

describe("LineChatMessage.reply", () => {
  it("kirim biasa: sekali jalan, tanpa E2EE", async () => {
    const { message, calls } = fakeMessage(["ok"]);
    await new LineChatMessage(message as never, resolverWith([])).reply("halo");
    assert.deepEqual(calls, ["halo"]);
  });

  it("E2EE_RETRY_ENCRYPT: diulang dengan e2ee:true", async () => {
    const { message, calls } = fakeMessage(["E2EE_RETRY_ENCRYPT", "ok"]);
    await new LineChatMessage(message as never, resolverWith([])).reply("halo");
    assert.deepEqual(calls, ["halo", { text: "halo", e2ee: true }]);
  });

  it("E2EE_RECREATE_GROUP_KEY (mis. setelah tab kickall): kunci grup didaftar ulang, lalu diulang dengan cara yang sama seperti semula", async () => {
    const registered: string[] = [];
    const { message, calls } = fakeMessage(["E2EE_RECREATE_GROUP_KEY", "ok"]);
    await new LineChatMessage(message as never, resolverWith(registered), 0).reply("Selesai");

    assert.deepEqual(registered, ["cG1"]);
    // Bukan { e2ee: true } — memaksa E2EE di sini pernah membuat pesan "tidak dapat ditampilkan" di penerima.
    assert.deepEqual(calls, ["Selesai", "Selesai"]);
  });

  it("error lain: dilempar lagi, tidak diam-diam ditelan", async () => {
    const { message } = fakeMessage(["LAIN_LAIN"]);
    await assert.rejects(new LineChatMessage(message as never, resolverWith([])).reply("halo"), /LAIN_LAIN/);
  });
});
