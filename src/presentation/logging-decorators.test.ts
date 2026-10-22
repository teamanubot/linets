import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeMessage, FakeNotifier } from "../application/test-doubles.ts";
import type { MediaSender } from "../domain/ports.ts";
import type { Logger } from "./logger.ts";
import { LoggingChatMessage, LoggingMediaSender, LoggingNotifier, previewOf } from "./logging-decorators.ts";

class RecordingLogger implements Logger {
  lines: string[] = [];
  info(message: string) { this.lines.push(message); }
  error(message: string) { this.lines.push(`E ${message}`); }
}

describe("previewOf", () => {
  it("teks dipotong, media dan stiker diberi label", () => {
    assert.equal(previewOf("halo", null), '"halo"');
    assert.equal(previewOf("x".repeat(100), null), `"${"x".repeat(59)}…"`);
    assert.equal(previewOf("", "image"), "[gambar]");
    assert.equal(previewOf("", "video"), "[video]");
    assert.equal(previewOf("", null), "[pesan non-teks]");
  });
});

describe("LoggingChatMessage", () => {
  it("mencatat balasan lalu meneruskannya, dan membungkus pesan yang di-reply", async () => {
    const logger = new RecordingLogger();
    const target = new FakeMessage({ mediaKind: "image" });
    const inner = new FakeMessage({ isGroupChat: true, replied: target });
    const message = new LoggingChatMessage(inner, logger);

    await message.reply("pong 🏓");
    const replied = await message.repliedMessage();
    await replied!.reply("ok");

    assert.deepEqual(inner.replies, ["pong 🏓"]);
    assert.deepEqual(target.replies, ["ok"]);
    assert.deepEqual(logger.lines, ['📤 kirim (grup): "pong 🏓"', '📤 kirim (pribadi): "ok"'].map((line, i) => (i === 1 ? line.replace("pribadi", "grup") : line)));
  });

  it("properti pesan diteruskan apa adanya", () => {
    const inner = new FakeMessage({ id: "m9", senderId: "uX", text: "tab ping", chatId: "cG", mentionedIds: ["uA"] });
    const message = new LoggingChatMessage(inner, new RecordingLogger());

    assert.equal(message.id, "m9");
    assert.equal(message.senderId, "uX");
    assert.equal(message.text, "tab ping");
    assert.equal(message.chatId, "cG");
    assert.deepEqual(message.mentionedIds, ["uA"]);
  });
});

describe("LoggingMediaSender & LoggingNotifier", () => {
  it("mencatat gambar, video, dan pemberitahuan yang dikirim", async () => {
    const logger = new RecordingLogger();
    const sent: string[] = [];
    const inner: MediaSender = {
      sendImage: async (_chat, image) => void sent.push(`image:${image.length}`),
      sendVideo: async (_chat, video, ms) => void sent.push(`video:${video.length}:${ms}`),
      sendAudio: async (_chat, audio, ms) => void sent.push(`audio:${audio.length}:${ms}`),
      sendFile: async (_chat, file, name) => void sent.push(`file:${file.length}:${name}`),
    };
    const sender = new LoggingMediaSender(inner, logger);
    await sender.sendImage("c1", Buffer.alloc(2048));
    await sender.sendVideo("c1", Buffer.alloc(2 * 1024 * 1024), 12_000);
    await sender.sendAudio("c1", Buffer.alloc(1024 * 1024), 9_000);
    await sender.sendFile("c1", Buffer.alloc(512 * 1024), "berkas.pdf");

    const notifier = new FakeNotifier();
    await new LoggingNotifier(notifier, logger).notify("🗑️ Pesan ditarik");

    assert.deepEqual(sent, ["image:2048", `video:${2 * 1024 * 1024}:12000`, `audio:${1024 * 1024}:9000`, `file:${512 * 1024}:berkas.pdf`]);
    assert.deepEqual(notifier.sent, ["🗑️ Pesan ditarik"]);
    assert.deepEqual(logger.lines, [
      "📤 kirim gambar (2 KB)",
      "📤 kirim video (2.0 MB, 12 dtk)",
      "📤 kirim audio (1.0 MB, 9 dtk)",
      '📤 kirim file "berkas.pdf" (0.5 MB)',
      '📤 kirim ke chat sendiri: "🗑️ Pesan ditarik"',
    ]);
  });
});
