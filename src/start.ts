import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const PROTEKSI_ENTRY = new URL("./main-proteksi.ts", import.meta.url);

/** Tanya pengguna ya/tidak di terminal; default ke `fallback` kalau Enter kosong atau bukan TTY. */
async function askYesNo(question: string, fallback: boolean): Promise<boolean> {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} (${fallback ? "Y/n" : "y/N"}) `)).trim().toLowerCase();
    if (!answer) return fallback;
    return answer === "y" || answer === "ya" || answer === "yes";
  } finally {
    rl.close();
  }
}

const hasProteksi = existsSync(fileURLToPath(PROTEKSI_ENTRY));

// Tidak ada file proteksi (mis. belum dibuat, atau sengaja dihapus) → langsung jalan tanpa GroupGuard, tanpa tanya.
if (!hasProteksi) {
  console.log("ℹ️ File main-proteksi.ts tidak ditemukan, jalan tanpa Group Guard (proteksi anti-kick-massal).");
  await import("./main.ts");
} else {
  const useProteksi = await askYesNo("Pakai Group Guard (proteksi anti-kick-massal)?", false);
  if (useProteksi) {
    console.log("✅ Group Guard diaktifkan.");
    await import("./main-proteksi.ts");
  } else {
    console.log("Jalan tanpa Group Guard.");
    await import("./main.ts");
  }
}
