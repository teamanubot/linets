/**
 * Pesan yang dibuat sebelum bot menyala tidak boleh dijalankan: server LINE kadang mengirim ulang operasi
 * terbaru ke poller baru, sehingga perintah lama (mis. unduhan, ganti profil, keluar grup) bisa terulang.
 * Toleransi mencakup selisih jam lokal dengan server.
 */
export const STALE_TOLERANCE_MS = 15_000;

export function isFromBeforeStart(createdTimeMs: number, startedAtMs: number): boolean {
  return Number.isFinite(createdTimeMs) && createdTimeMs < startedAtMs - STALE_TOLERANCE_MS;
}
