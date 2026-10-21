import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AccountService } from "./account-service.ts";
import { FakeMessage, FakeProfile } from "./test-doubles.ts";

describe("AccountService", () => {
  it("setName: ganti nama dan memberi tahu", async () => {
    const profile = new FakeProfile();
    const message = new FakeMessage();
    await new AccountService(profile).setName("Budi", message);

    assert.deepEqual(profile.calls, ["setDisplayName:Budi"]);
    assert.match(message.replies[0]!, /Berhasil/);
  });

  it("setName: kosong atau terlalu panjang ditolak", async () => {
    const profile = new FakeProfile();
    const service = new AccountService(profile);
    const empty = new FakeMessage();
    const long = new FakeMessage();
    await service.setName("", empty);
    await service.setName("x".repeat(21), long);

    assert.deepEqual(profile.calls, []);
    assert.match(empty.replies[0]!, /Pakai: tab nama/);
    assert.match(long.replies[0]!, /terlalu panjang/);
  });

  it("setStatus: boleh dikosongkan", async () => {
    const profile = new FakeProfile();
    const message = new FakeMessage();
    await new AccountService(profile).setStatus("", message);

    assert.deepEqual(profile.calls, ["setStatusMessage:"]);
    assert.match(message.replies[0]!, /dikosongkan/);
  });

  it("setStatus: terlalu panjang ditolak", async () => {
    const profile = new FakeProfile();
    const message = new FakeMessage();
    await new AccountService(profile).setStatus("x".repeat(501), message);

    assert.deepEqual(profile.calls, []);
    assert.match(message.replies[0]!, /terlalu panjang/);
  });
});
