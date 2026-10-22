import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { AutoRead } from "./auto-read.ts";
import { FakeMessage, FakeSettingsStore } from "./test-doubles.ts";

describe("AutoRead", () => {
  let store: FakeSettingsStore;
  let service: AutoRead;

  beforeEach(async () => {
    store = new FakeSettingsStore();
    service = new AutoRead({ store });
    await service.init();
  });

  it("default mati: pesan masuk tidak ditandai dibaca", async () => {
    const message = new FakeMessage({ fromSelf: false });
    const handled = await service.handleIncoming(message);
    assert.equal(handled, false);
    assert.equal(message.readCount, 0);
  });

  it("aktif: menandai pesan dari orang lain (grup maupun pribadi) sebagai dibaca", async () => {
    await service.configure("on", new FakeMessage());

    const group = new FakeMessage({ fromSelf: false, isGroupChat: true });
    const personal = new FakeMessage({ fromSelf: false, isGroupChat: false });
    assert.equal(await service.handleIncoming(group), true);
    assert.equal(await service.handleIncoming(personal), true);
    assert.equal(group.readCount, 1);
    assert.equal(personal.readCount, 1);
  });

  it("tidak menandai pesan dari akun sendiri", async () => {
    await service.configure("on", new FakeMessage());
    const own = new FakeMessage({ fromSelf: true });
    assert.equal(await service.handleIncoming(own), false);
    assert.equal(own.readCount, 0);
  });

  it("off mematikan; tanpa argumen menampilkan status; pengaturan tersimpan", async () => {
    await service.configure("on", new FakeMessage());
    const off = new FakeMessage();
    await service.configure("off", off);
    assert.match(off.replies[0]!, /dimatikan/);
    assert.equal(store.saved.at(-1)?.autoRead.enabled, false);

    const message = new FakeMessage({ fromSelf: false });
    assert.equal(await service.handleIncoming(message), false);

    const status = new FakeMessage();
    await service.configure("", status);
    assert.match(status.replies[0]!, /MATI/);
  });
});
