import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { AutoReply } from "./auto-reply.ts";
import { FakeMessage, FakeSettingsStore } from "./test-doubles.ts";

const incoming = (senderId: string, extra: ConstructorParameters<typeof FakeMessage>[0] = {}) =>
  new FakeMessage({ fromSelf: false, senderId, isGroupChat: false, ...extra });

describe("AutoReply", () => {
  let store: FakeSettingsStore;
  let clock: number;
  let service: AutoReply;

  beforeEach(async () => {
    store = new FakeSettingsStore();
    clock = 0;
    service = new AutoReply({ store, cooldownMs: 1000, now: () => clock });
    await service.init();
  });

  const enable = (text = "Lagi sibuk") => service.configure(text, new FakeMessage());

  it("default mati: tidak membalas", async () => {
    const message = incoming("uA");
    await service.handleIncoming(message);
    assert.deepEqual(message.replies, []);
  });

  it("aktif: membalas chat pribadi dan menyimpan pengaturan", async () => {
    await enable("Lagi sibuk");
    const message = incoming("uA");
    await service.handleIncoming(message);

    assert.deepEqual(message.replies, ["Lagi sibuk"]);
    assert.deepEqual(store.saved.at(-1)?.autoReply, { enabled: true, text: "Lagi sibuk" });
  });

  it("jeda per orang: tidak membalas dua kali berturut-turut, tapi orang lain tetap dibalas", async () => {
    await enable();
    const first = incoming("uA");
    await service.handleIncoming(first);
    clock = 500;
    const again = incoming("uA");
    const other = incoming("uB");
    await service.handleIncoming(again);
    await service.handleIncoming(other);
    clock = 1500;
    const later = incoming("uA");
    await service.handleIncoming(later);

    assert.equal(first.replies.length, 1);
    assert.deepEqual(again.replies, []);
    assert.equal(other.replies.length, 1);
    assert.equal(later.replies.length, 1);
  });

  it("tidak membalas grup dan pesan sendiri", async () => {
    await enable();
    const group = incoming("uA", { isGroupChat: true });
    const own = new FakeMessage({ fromSelf: true, isGroupChat: false });
    await service.handleIncoming(group);
    await service.handleIncoming(own);
    assert.deepEqual(group.replies, []);
    assert.deepEqual(own.replies, []);
  });

  it("off mematikan; teks terlalu panjang ditolak; tanpa argumen menampilkan status", async () => {
    await enable();
    const off = new FakeMessage();
    await service.configure("off", off);
    const message = incoming("uA");
    await service.handleIncoming(message);
    assert.deepEqual(message.replies, []);
    assert.match(off.replies[0]!, /dimatikan/);

    const long = new FakeMessage();
    await service.configure("x".repeat(501), long);
    assert.match(long.replies[0]!, /terlalu panjang/);

    const status = new FakeMessage();
    await service.configure("", status);
    assert.match(status.replies[0]!, /MATI/);
  });
});
