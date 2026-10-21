import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApiProbe } from "../domain/ports.ts";
import { formatDuration, formatTiny, SpeedTest } from "./speed-test.ts";
import { FakeMessage } from "./test-doubles.ts";

/** Jam palsu: tiap pembacaan maju 100 ms. */
const steppingClock = () => {
  let time = 0;
  return () => (time += 100);
};

class CountingProbe implements ApiProbe {
  pings = 0;
  async ping() {
    this.pings++;
  }
}

/** Pesan yang, saat dibalas dengan pesan uji, langsung "kembali" sebagai event ke SpeedTest. */
class EchoingMessage extends FakeMessage {
  constructor(private readonly speed: () => SpeedTest, private readonly echo = true) {
    super();
  }
  override async reply(text: string) {
    await super.reply(text);
    if (this.echo && text.startsWith("⏱️")) this.speed().observe(new FakeMessage({ text, fromSelf: true }));
  }
}

describe("formatDuration", () => {
  it("menampilkan ms dan detik dengan koma desimal", () => {
    assert.equal(formatDuration(123.4), "123 ms (0,12 dtk)");
    assert.equal(formatDuration(1500), "1500 ms (1,50 dtk)");
  });
});

describe("formatTiny", () => {
  it("angka di bawah 1 ms ditampilkan dengan presisi mikrodetik", () => {
    assert.equal(formatTiny(0.084), "0,084 ms (84 µs)");
    assert.equal(formatTiny(0.0004), "0,000 ms (0 µs)");
  });

  it("angka 1 ms ke atas memakai format biasa", () => {
    assert.equal(formatTiny(250), "250 ms (0,25 dtk)");
  });
});

describe("SpeedTest", () => {
  it("melaporkan ping, kirim pesan, dan pulang-pergi", async () => {
    const probe = new CountingProbe();
    const speed: SpeedTest = new SpeedTest({ probe, now: steppingClock(), samples: 3 });
    const message = new EchoingMessage(() => speed);
    await speed.run(message);

    assert.equal(probe.pings, 3);
    assert.equal(message.replies.length, 2);
    assert.match(message.replies[0]!, /^⏱️ Mengukur kecepatan… \(#[a-z0-9]+\)$/);
    const report = message.replies[1]!;
    assert.match(report, /KECEPATAN BOT/);
    assert.match(report, /Ping API LINE: 100 ms \(0,10 dtk\)/);
    assert.match(report, /rata-rata 3× · min 100 ms · maks 100 ms/);
    assert.match(report, /Kirim pesan: \d+ ms/);
    assert.match(report, /Pulang-pergi: \d+ ms \(\d,\d\d dtk\)/);
    assert.match(report, /Penilaian: 🟢 Cepat/);
    assert.match(report, /Proses internal bot: \d+,\d{3} ms \(\d+ µs\)|Proses internal bot: \d+ ms/);
    assert.match(report, /jarak jaringan/);
  });

  it("pesan uji tidak kembali: timeout dilaporkan dan penilaian memakai waktu kirim", async () => {
    const speed = new SpeedTest({ probe: new CountingProbe(), now: steppingClock(), samples: 1, roundTripTimeoutMs: 20 });
    const message = new EchoingMessage(() => speed, false);
    await speed.run(message);

    assert.match(message.replies[1]!, /Pulang-pergi: pesan uji tidak kembali \(timeout\)/);
    assert.match(message.replies[1]!, /Penilaian: /);
  });

  it("penilaian lambat bila pulang-pergi di atas 1,5 detik", async () => {
    let time = 0;
    const slowClock = () => (time += 2000);
    const speed: SpeedTest = new SpeedTest({ probe: new CountingProbe(), now: slowClock, samples: 1 });
    const message = new EchoingMessage(() => speed);
    await speed.run(message);

    assert.match(message.replies[1]!, /Penilaian: 🔴 Lambat/);
  });

  it("observe mengabaikan pesan orang lain dan pesan biasa", () => {
    const speed = new SpeedTest({ probe: new CountingProbe() });
    speed.observe(new FakeMessage({ text: "⏱️ Mengukur kecepatan… (#abc123)", fromSelf: false }));
    speed.observe(new FakeMessage({ text: "halo", fromSelf: true }));
    assert.ok(true);
  });
});
