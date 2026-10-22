import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { DEFAULT_SETTINGS, type BotSettings } from "../domain/ports.ts";
import { AutoReply } from "./auto-reply.ts";
import { FakeMessage, FakeSettingsStore } from "./test-doubles.ts";

const incoming = (senderId: string, extra: ConstructorParameters<typeof FakeMessage>[0] = {}) =>
  new FakeMessage({ fromSelf: false, senderId, isGroupChat: false, ...extra });

function settingsWith(autoReply: Partial<BotSettings["autoReply"]>): BotSettings {
  return { ...structuredClone(DEFAULT_SETTINGS), autoReply: { ...DEFAULT_SETTINGS.autoReply, intervalMs: 1000, limit: 1, ...autoReply } };
}

describe("AutoReply", () => {
  let store: FakeSettingsStore;
  let clock: number;
  let service: AutoReply;

  beforeEach(async () => {
    store = new FakeSettingsStore(settingsWith({}));
    clock = 0;
    service = new AutoReply({ store, now: () => clock });
    await service.init();
  });

  const enable = (text = "Lagi sibuk") => service.configure(text, new FakeMessage());

  it("default mati: tidak membalas", async () => {
    const message = incoming("uA");
    await service.handleIncoming(message);
    assert.deepEqual(message.replies, []);
  });

  it("aktif: membalas chat pribadi dan menyimpan pengaturan (jeda/limit tidak ikut berubah)", async () => {
    await enable("Lagi sibuk");
    const message = incoming("uA");
    await service.handleIncoming(message);

    assert.deepEqual(message.replies, ["Lagi sibuk"]);
    assert.deepEqual(store.saved.at(-1)?.autoReply, { enabled: true, text: "Lagi sibuk", intervalMs: 1000, limit: 1 });
  });

  it("jeda per orang (limit 1): tidak membalas dua kali dalam jendela, tapi orang lain tetap dibalas", async () => {
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

  it("limit lebih dari 1: boleh dibalas beberapa kali dalam jendela yang sama, lalu berhenti", async () => {
    store = new FakeSettingsStore(settingsWith({ intervalMs: 1000, limit: 2 }));
    service = new AutoReply({ store, now: () => clock });
    await service.init();
    await enable();

    const first = incoming("uA");
    await service.handleIncoming(first);
    clock = 200;
    const second = incoming("uA");
    await service.handleIncoming(second);
    clock = 400;
    const third = incoming("uA");
    await service.handleIncoming(third);

    assert.equal(first.replies.length, 1);
    assert.equal(second.replies.length, 1);
    assert.deepEqual(third.replies, []);
  });

  it("tab autoreply jeda <jam> [kali]: mengatur interval dan limit tanpa mengubah teks/status aktif", async () => {
    await enable("Halo");
    const reply = new FakeMessage();
    await service.configure("jeda 2 2", reply);

    assert.match(reply.replies[0]!, /maks\. 2x balasan per orang tiap 2 jam/);
    assert.deepEqual(store.saved.at(-1)?.autoReply, { enabled: true, text: "Halo", intervalMs: 2 * 60 * 60_000, limit: 2 });
  });

  it("tab autoreply jeda <jam> saja: limit sebelumnya dipertahankan", async () => {
    await service.configure("jeda 2 3", new FakeMessage());
    const reply = new FakeMessage();
    await service.configure("jeda 0.5", reply);

    assert.match(reply.replies[0]!, /maks\. 3x balasan per orang tiap 30 menit/);
  });

  it("tab autoreply jeda dengan input tidak valid: ditolak dengan petunjuk, pengaturan tidak berubah", async () => {
    const before = store.saved.length;
    for (const input of ["jeda", "jeda abc", "jeda 0", "jeda 1 0", "jeda 1 1.5", "jeda 1 999"]) {
      const reply = new FakeMessage();
      await service.configure(input, reply);
      assert.match(reply.replies[0]!, /Pakai: tab autoreply jeda/, input);
    }
    assert.equal(store.saved.length, before);
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

  it("off mematikan; teks terlalu panjang ditolak; tanpa argumen menampilkan status dan jeda", async () => {
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

    await enable();
    const statusOn = new FakeMessage();
    await service.configure("", statusOn);
    assert.match(statusOn.replies[0]!, /AKTIF/);
    assert.match(statusOn.replies[0]!, /maks\. 1x per orang tiap/);
  });

  it("on menyalakan lagi pakai teks sebelumnya, bukan menjadikan 'on' sebagai teks balasan", async () => {
    await enable("Lagi sibuk banget");
    await service.configure("off", new FakeMessage());

    const on = new FakeMessage();
    await service.configure("on", on);
    assert.match(on.replies[0]!, /diaktifkan kembali/);
    assert.match(on.replies[0]!, /Lagi sibuk banget/);

    const message = incoming("uA");
    await service.handleIncoming(message);
    assert.deepEqual(message.replies, ["Lagi sibuk banget"]);
  });

  it("on tanpa teks sebelumnya: ditolak dengan petunjuk", async () => {
    const on = new FakeMessage();
    await service.configure("on", on);
    assert.match(on.replies[0]!, /Belum ada teks balasan sebelumnya/);
  });
});
