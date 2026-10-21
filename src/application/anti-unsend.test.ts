import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { AntiUnsend } from "./anti-unsend.ts";
import { FakeMessage, FakeNotifier, FakePeople, FakeSettingsStore } from "./test-doubles.ts";

const other = (id: string, text: string, extra: ConstructorParameters<typeof FakeMessage>[0] = {}) =>
  new FakeMessage({ id, text, fromSelf: false, senderId: "uBUDI", ...extra });

describe("AntiUnsend", () => {
  let notifier: FakeNotifier;
  let service: AntiUnsend;

  beforeEach(async () => {
    notifier = new FakeNotifier();
    service = new AntiUnsend({ store: new FakeSettingsStore(), notifier, people: new FakePeople({ uBUDI: "Budi" }), capacity: 3 });
    await service.init();
  });

  it("memberi tahu isi pesan orang lain yang ditarik", async () => {
    service.remember(other("m1", "rahasia", { isGroupChat: false }));
    await service.onUnsent("m1");

    assert.equal(notifier.sent.length, 1);
    assert.match(notifier.sent[0]!, /Dari: Budi/);
    assert.match(notifier.sent[0]!, /chat pribadi/);
    assert.match(notifier.sent[0]!, /Isi: rahasia/);
  });

  it("media dilaporkan jenisnya", async () => {
    service.remember(other("m2", "", { mediaKind: "image" }));
    await service.onUnsent("m2");
    assert.match(notifier.sent[0]!, /\[gambar\]/);
  });

  it("pesan sendiri tidak dicatat; pesan tak dikenal diabaikan", async () => {
    service.remember(new FakeMessage({ id: "m3", text: "punyaku", fromSelf: true }));
    await service.onUnsent("m3");
    await service.onUnsent("tidak-ada");
    assert.deepEqual(notifier.sent, []);
  });

  it("kapasitas terbatas: pesan paling lama dilepas", async () => {
    for (const id of ["a", "b", "c", "d"]) service.remember(other(id, id));
    await service.onUnsent("a");
    await service.onUnsent("d");
    assert.equal(notifier.sent.length, 1);
    assert.match(notifier.sent[0]!, /Isi: d/);
  });

  it("tab antiunsend off: tidak ada pemberitahuan dan pengaturan tersimpan", async () => {
    const store = new FakeSettingsStore();
    const off = new AntiUnsend({ store, notifier, people: new FakePeople() });
    await off.init();
    const reply = new FakeMessage();
    await off.configure("off", reply);
    off.remember(other("m4", "x"));
    await off.onUnsent("m4");

    assert.deepEqual(notifier.sent, []);
    assert.equal(store.saved.at(-1)?.antiUnsend.enabled, false);
    assert.match(reply.replies[0]!, /dimatikan/);
  });

  it("tab antiunsend tanpa argumen: tampilkan status", async () => {
    const reply = new FakeMessage();
    await service.configure("", reply);
    assert.match(reply.replies[0]!, /AKTIF/);
  });
});
