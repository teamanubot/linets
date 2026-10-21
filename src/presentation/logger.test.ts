import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createConsoleLogger, formatElapsed, logged, shorten, type Logger } from "./logger.ts";

class RecordingLogger implements Logger {
  lines: string[] = [];
  info(message: string) {
    this.lines.push(`I ${message}`);
  }
  error(message: string) {
    this.lines.push(`E ${message}`);
  }
}

describe("logger", () => {
  it("formatElapsed: ms di bawah 1 detik, detik dengan koma di atasnya", () => {
    assert.equal(formatElapsed(120.4), "120 ms");
    assert.equal(formatElapsed(2450), "2,5 dtk");
  });

  it("shorten: meratakan spasi dan memotong dengan elipsis", () => {
    assert.equal(shorten("a\n  b   c"), "a b c");
    assert.equal(shorten("x".repeat(100), 10), `${"x".repeat(9)}…`);
  });

  it("logger konsol memberi jam HH:MM:SS di depan pesan", () => {
    const original = console.log;
    const printed: string[] = [];
    console.log = (line: string) => void printed.push(line);
    try {
      createConsoleLogger(() => new Date(2026, 9, 21, 22, 51, 3)).info("halo");
    } finally {
      console.log = original;
    }
    assert.deepEqual(printed, ["[22:51:03] halo"]);
  });

  it("logged: mencatat selesai dan mengembalikan hasil", async () => {
    const logger = new RecordingLogger();
    const result = await logged(logger, "tab ping", async () => 42);

    assert.equal(result, 42);
    assert.match(logger.lines[0]!, /^I ✅ tab ping selesai \(\d+ ms\)$/);
  });

  it("logged: mencatat gagal (satu baris) dan meneruskan error aslinya", async () => {
    const logger = new RecordingLogger();
    const failure = new Error("Video unavailable\n    at stack...");

    await assert.rejects(logged(logger, "tab vpl x", async () => Promise.reject(failure)), failure);
    assert.match(logger.lines[0]!, /^E ❌ tab vpl x gagal: Video unavailable \(\d+ ms\)$/);
  });
});
