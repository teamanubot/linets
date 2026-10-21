import type { ChatMessage } from "../domain/chat.ts";
import type { ApiProbe } from "../domain/ports.ts";

export interface SpeedTestDeps {
  probe: ApiProbe;
  /** Jam monoton dalam milidetik (default `performance.now`). */
  now?: () => number;
  /** Jumlah panggilan ping, default 5. */
  samples?: number;
  /** Batas menunggu pesan uji kembali sebagai event, default 10 detik. */
  roundTripTimeoutMs?: number;
  /** Mengukur keterlambatan event loop (ms); default memakai `setImmediate`. */
  eventLoopLag?: () => Promise<number>;
}

const DEFAULT_SAMPLES = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const PROBE_TEXT = "⏱️ Mengukur kecepatan…";
const TOKEN_PATTERN = /\(#([a-z0-9]+)\)/;

const RATINGS = [
  { below: 500, label: "🟢 Cepat" },
  { below: 1500, label: "🟡 Sedang" },
  { below: Infinity, label: "🔴 Lambat" },
] as const;

/** Waktu sangat kecil dengan presisi: "0,084 ms (84 µs)". */
export function formatTiny(ms: number): string {
  const micros = Math.round(ms * 1000);
  return ms >= 1 ? formatDuration(ms) : `${ms.toFixed(3).replace(".", ",")} ms (${micros} µs)`;
}

/** Format "123 ms (0,12 dtk)". */
export function formatDuration(ms: number): string {
  return `${Math.round(ms)} ms (${(ms / 1000).toFixed(2).replace(".", ",")} dtk)`;
}

/**
 * Mengukur waktu respon bot tanpa bergantung pada jam server (jam lokal bisa selisih):
 * - ping API (beberapa kali),
 * - waktu mengirim pesan,
 * - pulang-pergi: pesan uji dikirim lalu ditunggu sampai kembali sebagai event.
 */
export class SpeedTest {
  private readonly now: () => number;
  private readonly samples: number;
  private readonly timeoutMs: number;
  private readonly eventLoopLag: () => Promise<number>;
  private readonly waiting = new Map<string, (arrivedAt: number) => void>();

  constructor(private readonly deps: SpeedTestDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.samples = deps.samples ?? DEFAULT_SAMPLES;
    this.timeoutMs = deps.roundTripTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.eventLoopLag = deps.eventLoopLag ?? (() => measureEventLoopLag(this.now));
  }

  /** Dipanggil untuk setiap pesan masuk; mengenali pesan uji yang kembali. */
  observe(message: ChatMessage): void {
    if (!message.isFromSelf || !message.text.startsWith(PROBE_TEXT)) return;
    const token = TOKEN_PATTERN.exec(message.text)?.[1];
    const arrived = token ? this.waiting.get(token) : undefined;
    if (arrived) arrived(this.now());
  }

  async run(message: ChatMessage): Promise<void> {
    const token = Math.random().toString(36).slice(2, 8);
    const sendStart = this.now();
    const echo = this.waitForEcho(token);

    await message.reply(`${PROBE_TEXT} (#${token})`);
    const sendMs = this.now() - sendStart;
    const arrivedAt = await echo;
    const roundTripMs = arrivedAt === null ? null : arrivedAt - sendStart;

    const pings = await this.measurePings();
    const lagMs = await this.eventLoopLag();
    await message.reply(this.report({ pings, sendMs, roundTripMs, lagMs }));
  }

  private waitForEcho(token: string): Promise<number | null> {
    return new Promise((resolve) => {
      const finish = (arrivedAt: number | null) => {
        clearTimeout(timer);
        this.waiting.delete(token);
        resolve(arrivedAt);
      };
      const timer = setTimeout(() => finish(null), this.timeoutMs);
      this.waiting.set(token, finish);
    });
  }

  private async measurePings(): Promise<number[]> {
    const results: number[] = [];
    for (let i = 0; i < this.samples; i++) {
      const start = this.now();
      await this.deps.probe.ping();
      results.push(this.now() - start);
    }
    return results;
  }

  private report({ pings, sendMs, roundTripMs, lagMs }: { pings: number[]; sendMs: number; roundTripMs: number | null; lagMs: number }): string {
    const average = pings.reduce((sum, value) => sum + value, 0) / pings.length;
    const rated = roundTripMs ?? sendMs;
    const rating = RATINGS.find((candidate) => rated < candidate.below)!.label;

    return [
      "⚡ KECEPATAN BOT",
      "━━━━━━━━━━━━━━━━━━",
      `🌐 Ping API LINE: ${formatDuration(average)}`,
      `   rata-rata ${pings.length}× · min ${Math.round(Math.min(...pings))} ms · maks ${Math.round(Math.max(...pings))} ms`,
      `✉️ Kirim pesan: ${formatDuration(sendMs)}`,
      `🔁 Pulang-pergi: ${roundTripMs === null ? "pesan uji tidak kembali (timeout)" : formatDuration(roundTripMs)}`,
      `⚙️ Proses internal bot: ${formatTiny(lagMs)}`,
      "━━━━━━━━━━━━━━━━━━",
      `Penilaian: ${rating}`,
      "ℹ️ Tiga angka pertama termasuk jarak jaringan ke server LINE (tidak bisa lebih kecil dari itu).",
    ].join("\n");
  }
}

/** Seberapa lama bot baru bisa menjalankan tugas berikutnya; angka kecil = bot tidak terbebani. */
async function measureEventLoopLag(now: () => number): Promise<number> {
  const start = now();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return now() - start;
}
