import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMMAND_PREFIX, createCommands } from "./commands.ts";
import { HELP_SECTIONS, renderHelp } from "./help.ts";

describe("bantuan", () => {
  it("setiap perintah terdaftar muncul di menu bantuan", () => {
    const commands = Object.keys(createCommands({} as never));
    const documented = new Set(HELP_SECTIONS.flatMap((section) => section.items.map((item) => item.usage.split(" ")[0])));
    const missing = commands.filter((name) => !documented.has(name));

    assert.deepEqual(missing, []);
  });

  it("setiap perintah di bantuan benar-benar ada", () => {
    const commands = new Set(Object.keys(createCommands({} as never)));
    const unknown = HELP_SECTIONS.flatMap((section) => section.items.map((item) => item.usage.split(" ")[0]!)).filter(
      (name) => !commands.has(name),
    );

    assert.deepEqual(unknown, []);
  });

  it("menu utama memuat semua kelompok dan petunjuk topik", () => {
    const menu = renderHelp();
    for (const section of HELP_SECTIONS) assert.ok(menu.includes(section.title), section.title);
    assert.ok(menu.includes(`${COMMAND_PREFIX} help <`));
  });

  it("tab help <topik> menampilkan detail, tidak peduli huruf besar", () => {
    const topic = renderHelp("  Cover ");
    assert.ok(topic.includes("Cara pakai"));
    assert.ok(topic.includes("15 detik"));
    assert.ok(!topic.includes("GRUP"));
  });

  it("topik tidak dikenal kembali ke menu dengan catatan", () => {
    const text = renderHelp("ngawur");
    assert.ok(text.includes('Topik "ngawur" tidak ada.'));
    assert.ok(text.includes("MENU BOT LINE"));
  });

  it("panjang menu jauh di bawah batas pesan LINE (5000 karakter)", () => {
    assert.ok(renderHelp().length < 2000);
  });
});
