export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

/** Log ke terminal dengan jam di depannya, mis. `[22:51:03] tab ping → selesai (120 ms)`. */
export function createConsoleLogger(now: () => Date = () => new Date()): Logger {
  const stamp = () => now().toTimeString().slice(0, 8);
  return {
    info: (message) => console.log(`[${stamp()}] ${message}`),
    error: (message) => console.error(`[${stamp()}] ${message}`),
  };
}

/** "120 ms" atau "2,4 dtk". */
export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} dtk`;
}

/** Potong teks panjang untuk log, dan ganti baris baru dengan spasi. */
export function shorten(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Jalankan `work`, catat hasil dan lamanya, lalu teruskan hasil atau error aslinya. */
export async function logged<T>(logger: Logger, label: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const elapsed = () => formatElapsed(performance.now() - start);
  try {
    const result = await work();
    logger.info(`✅ ${label} selesai (${elapsed()})`);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.error(`❌ ${label} gagal: ${shorten(reason, 120)} (${elapsed()})`);
    throw error;
  }
}
