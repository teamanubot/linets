import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CachedMedia, UnsendMediaCache } from "../domain/ports.ts";

const DEFAULT_DIR = "./.antiunsend-cache";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60_000; // 7 hari
/** Berkas di atas ini tidak dicache (diam-diam dilewati), agar video/file raksasa tidak membanjiri disk. */
const DEFAULT_MAX_ITEM_BYTES = 100 * 1024 * 1024;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60_000; // 6 jam

interface Meta {
  kind: CachedMedia["kind"];
  filename?: string;
  savedAt: number;
}

/**
 * Cache sementara di disk untuk anti-unsend: begitu pesan di-unsend, LINE langsung menolak unduh ulang
 * isinya (HTTP 410 Gone, sudah dicoba langsung), jadi gambar/video/file harus sudah disimpan lebih dulu
 * kalau-kalau nanti ditarik. Kedaluwarsa otomatis (bawaan 7 hari) agar tidak menumpuk selamanya.
 */
export class FileUnsendCache implements UnsendMediaCache {
  private readonly dir: string;
  private readonly ttlMs: number;
  private readonly maxItemBytes: number;

  constructor(options: { dir?: string; ttlMs?: number; maxItemBytes?: number; autoCleanup?: boolean } = {}) {
    this.dir = options.dir ?? DEFAULT_DIR;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxItemBytes = options.maxItemBytes ?? DEFAULT_MAX_ITEM_BYTES;

    if (options.autoCleanup ?? true) {
      const timer = setInterval(() => void this.removeExpired(), CLEANUP_INTERVAL_MS);
      timer.unref?.();
    }
  }

  async put(messageId: string, media: CachedMedia): Promise<void> {
    if (media.data.length > this.maxItemBytes) return; // terlalu besar; dilewati diam-diam
    await mkdir(this.dir, { recursive: true });
    const meta: Meta = { kind: media.kind, filename: media.filename, savedAt: Date.now() };
    await Promise.all([writeFile(this.binPath(messageId), media.data), writeFile(this.metaPath(messageId), JSON.stringify(meta))]);
  }

  async take(messageId: string): Promise<CachedMedia | null> {
    try {
      const meta = JSON.parse(await readFile(this.metaPath(messageId), "utf8")) as Meta;
      const data = await readFile(this.binPath(messageId));
      await this.removeFiles(messageId);
      if (Date.now() - meta.savedAt > this.ttlMs) return null; // sudah kedaluwarsa, anggap tidak ada
      return { kind: meta.kind, filename: meta.filename, data };
    } catch {
      return null; // belum pernah disimpan / sudah diambil / dihapus
    }
  }

  /** Hapus semua berkas cache yang sudah lewat masa simpannya. Dipanggil berkala; bisa juga dipanggil manual saat startup. */
  async removeExpired(): Promise<number> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return 0;
    }

    let removed = 0;
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const messageId = name.slice(0, -".json".length);
      try {
        const meta = JSON.parse(await readFile(join(this.dir, name), "utf8")) as Meta;
        if (Date.now() - meta.savedAt > this.ttlMs) {
          await this.removeFiles(messageId);
          removed++;
        }
      } catch {
        // metadata rusak/hilang; lewati
      }
    }
    return removed;
  }

  private binPath(messageId: string): string {
    return join(this.dir, `${messageId}.bin`);
  }
  private metaPath(messageId: string): string {
    return join(this.dir, `${messageId}.json`);
  }
  private async removeFiles(messageId: string): Promise<void> {
    await Promise.all([rm(this.binPath(messageId), { force: true }), rm(this.metaPath(messageId), { force: true })]);
  }
}
