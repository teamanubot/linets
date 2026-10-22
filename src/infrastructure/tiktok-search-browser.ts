import { existsSync } from "node:fs";
import type { Browser, HTTPResponse } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import type { SearchProvider, SearchResultItem } from "../domain/ports.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CHROME_CANDIDATES = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium"];

function resolveChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => path && existsSync(path));
  if (!found) throw new Error("Browser Chrome/Chromium tidak ditemukan untuk pencarian TikTok. Set env CHROME_PATH atau install google-chrome.");
  return found;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SEARCH_TIMEOUT_MS = 45_000;
const MAX_RELOAD_ATTEMPTS = 3;

interface TikTokItem {
  id: string;
  desc?: string;
  author?: { uniqueId?: string };
  video?: { duration?: number };
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toResultItem(item: TikTokItem): SearchResultItem {
  const author = item.author?.uniqueId;
  return {
    title: (item.desc || "(tanpa teks)").trim(),
    author: author ? `@${author}` : undefined,
    link: author ? `https://www.tiktok.com/@${author}/video/${item.id}` : `https://www.tiktok.com/video/${item.id}`,
    extra: typeof item.video?.duration === "number" ? formatSeconds(item.video.duration) : undefined,
  };
}

/**
 * Pencarian TikTok lewat Chrome headless: TikTok memuat hasil pencarian lewat API yang wajib ditandatangani
 * (X-Bogus) oleh skrip TikTok sendiri, jadi tidak bisa diambil lewat HTTP biasa. Browser nyata yang menjalankan
 * skrip itu dipakai supaya permintaannya tertandatangani dengan benar, hasilnya ditangkap dari responnya.
 * Permintaan pertama ke halaman selalu kosong (TikTok belum punya token sesi); dimuat ulang sekali/lebih.
 */
export class TikTokSearchBrowser implements SearchProvider {
  private browser: Browser | null = null;

  async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setUserAgent(USER_AGENT);
      let captured: TikTokItem[] | null = null;
      page.on("response", (res: HTTPResponse) => {
        if (!res.url().includes("/api/search/general/full/")) return;
        res
          .text()
          .then((text) => {
            if (!text) return;
            const json = JSON.parse(text) as { data?: Array<{ item?: TikTokItem }> };
            const items = (json.data ?? []).map((entry) => entry.item).filter((item): item is TikTokItem => Boolean(item));
            if (items.length > 0) captured = items;
          })
          .catch(() => {
            // respon bukan JSON valid (jarang terjadi); diabaikan, coba lagi lewat reload berikutnya.
          });
      });

      const url = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
      await page.goto(url, { waitUntil: "networkidle2", timeout: SEARCH_TIMEOUT_MS });
      await delay(1500);

      for (let attempt = 0; attempt < MAX_RELOAD_ATTEMPTS && !captured; attempt++) {
        await page.reload({ waitUntil: "networkidle2", timeout: SEARCH_TIMEOUT_MS });
        await delay(1500);
      }

      if (!captured) throw new Error("TikTok tidak mengembalikan hasil (mungkin diblokir sementara). Coba lagi nanti.");
      const items: TikTokItem[] = captured;
      return items.slice(0, Math.max(1, Math.min(Math.trunc(limit), items.length))).map(toResultItem);
    } finally {
      await page.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    this.browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    return this.browser;
  }
}
