import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { GroupService, parseGroupTicket } from "./group-service.ts";
import { FakeGroups, FakeMessage } from "./test-doubles.ts";

const SELF = "u" + "a".repeat(32);
const FRIEND = "u" + "b".repeat(32);

describe("parseGroupTicket", () => {
  it("dari link dan dari tiket polos", () => {
    assert.equal(parseGroupTicket("https://line.me/R/ti/g/AbCdEfGhIj?x=1"), "AbCdEfGhIj");
    assert.equal(parseGroupTicket("  AbCdEfGhIj "), "AbCdEfGhIj");
  });

  it("menolak masukan yang bukan tiket", () => {
    assert.equal(parseGroupTicket(""), null);
    assert.equal(parseGroupTicket("halo dunia"), null);
  });
});

describe("GroupService", () => {
  let groups: FakeGroups;
  let service: GroupService;

  beforeEach(() => {
    groups = new FakeGroups();
    service = new GroupService(groups, SELF);
  });

  it("linkgrup: mengirim link", async () => {
    const message = new FakeMessage({ chatId: "cG1" });
    await service.createLink(message);

    assert.deepEqual(groups.calls, ["createInviteLink:cG1"]);
    assert.match(message.replies[0]!, /https:\/\/line\.me\/R\/ti\/g\/TICKET_cG1/);
  });

  it("perintah grup di chat pribadi ditolak", async () => {
    const message = new FakeMessage({ isGroupChat: false, mentionedIds: [FRIEND] });
    await service.createLink(message);
    await service.rename("Baru", message);
    await service.invite("", message);
    await service.kick(message);
    await service.leave("ya", message);

    assert.deepEqual(groups.calls, []);
    assert.equal(message.replies.length, 5);
    assert.ok(message.replies.every((reply) => /hanya bisa dipakai di chat grup/.test(reply)));
  });

  it("join: dari link; tanpa link diberi petunjuk", async () => {
    const ok = new FakeMessage({ isGroupChat: false });
    await service.join("https://line.me/R/ti/g/AbCdEfGhIj", ok);
    const bad = new FakeMessage({ isGroupChat: false });
    await service.join("", bad);

    assert.deepEqual(groups.calls, ["joinByTicket:AbCdEfGhIj"]);
    assert.match(ok.replies[0]!, /Grup Uji/);
    assert.match(bad.replies[0]!, /Pakai: tab join/);
  });

  it("namagrup: ganti nama; kosong atau terlalu panjang ditolak", async () => {
    const ok = new FakeMessage({ chatId: "cG1" });
    await service.rename("Nama Baru", ok);
    await service.rename("", new FakeMessage());
    const long = new FakeMessage();
    await service.rename("x".repeat(51), long);

    assert.deepEqual(groups.calls, ["rename:cG1:Nama Baru"]);
    assert.match(long.replies[0]!, /terlalu panjang/);
  });

  it("invite: dari mention dan id di teks, tanpa duplikat", async () => {
    const other = "u" + "c".repeat(32);
    const message = new FakeMessage({ chatId: "cG1", mentionedIds: [FRIEND] });
    await service.invite(`${FRIEND} ${other}`, message);

    assert.deepEqual(groups.calls, [`invite:cG1:${FRIEND},${other}`]);
  });

  it("invite tanpa target: beri petunjuk", async () => {
    const message = new FakeMessage();
    await service.invite("", message);

    assert.deepEqual(groups.calls, []);
    assert.match(message.replies[0]!, /Pakai: tab invite/);
  });

  it("tendang: hanya yang di-mention dan bukan diri sendiri", async () => {
    const message = new FakeMessage({ chatId: "cG1", mentionedIds: [SELF, FRIEND] });
    await service.kick(message);

    assert.deepEqual(groups.calls, [`kick:cG1:${FRIEND}`]);
  });

  it("tendang diri sendiri saja: ditolak", async () => {
    const message = new FakeMessage({ mentionedIds: [SELF] });
    await service.kick(message);

    assert.deepEqual(groups.calls, []);
    assert.match(message.replies[0]!, /Pakai: tab tendang/);
  });

  it("kickall: langsung jalan tanpa konfirmasi, mengeluarkan semua anggota kecuali diri sendiri", async () => {
    const other = "u" + "c".repeat(32);
    groups.groupMembers.cG1 = [SELF, FRIEND, other];

    const message = new FakeMessage({ chatId: "cG1" });
    await service.kickAll("", message);
    assert.deepEqual(groups.calls, ["members:cG1", `kick:cG1:${FRIEND},${other}`]);
    assert.match(message.replies[1]!, /Selesai\. Target: 2 orang/);
  });

  it("kickall: tanpa anggota lain (sendirian di grup)", async () => {
    groups.groupMembers.cG1 = [SELF];
    const message = new FakeMessage({ chatId: "cG1" });
    await service.kickAll("", message);

    assert.deepEqual(groups.calls, ["members:cG1"]);
    assert.match(message.replies.at(-1)!, /Tidak ada anggota lain/);
  });

  it("kickall: bukan admin (kick gagal total) tetap melapor, tidak melempar error ke pemanggil", async () => {
    groups.groupMembers.cG1 = [SELF, FRIEND];
    groups.kick = async () => Promise.reject(new Error("no permission"));
    const message = new FakeMessage({ chatId: "cG1" });
    await service.kickAll("", message);

    assert.match(message.replies.at(-1)!, /Gagal mengeluarkan siapa pun/);
  });

  it("perintah kickall di chat pribadi ditolak", async () => {
    const message = new FakeMessage({ isGroupChat: false });
    await service.kickAll("", message);
    assert.deepEqual(groups.calls, []);
    assert.match(message.replies[0]!, /hanya bisa dipakai di chat grup/);
  });

  it("keluar: butuh konfirmasi 'ya'", async () => {
    const ask = new FakeMessage({ chatId: "cG1" });
    await service.leave("", ask);
    assert.deepEqual(groups.calls, []);
    assert.match(ask.replies[0]!, /tab keluar ya/);

    const confirm = new FakeMessage({ chatId: "cG1" });
    await service.leave("ya", confirm);
    assert.deepEqual(groups.calls, ["leave:cG1"]);
    assert.equal(confirm.replies[0], "Keluar dari grup...");
  });
});
