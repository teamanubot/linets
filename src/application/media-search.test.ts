import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SearchProvider, SearchResultItem } from "../domain/ports.ts";
import { MediaSearch } from "./media-search.ts";
import { FakeMessage } from "./test-doubles.ts";

function makeItems(count: number, prefix = "Video"): SearchResultItem[] {
  return Array.from({ length: count }, (_, i) => ({ title: `${prefix} ${i + 1}`, author: `author${i + 1}`, link: `https://example.com/${i + 1}`, extra: "1:23" }));
}

class FakeProvider implements SearchProvider {
  calls: number[] = [];
  /** Total hasil "asli" yang dianggap tersedia di platform (provider tidak akan pernah mengembalikan lebih dari ini). */
  available = 35;
  fail: Error | null = null;

  async search(_query: string, limit: number): Promise<SearchResultItem[]> {
    this.calls.push(limit);
    if (this.fail) throw this.fail;
    return makeItems(Math.min(limit, this.available));
  }
}

describe("MediaSearch", () => {
  it("search: menampilkan 10 hasil teratas", async () => {
    const provider = new FakeProvider();
    const message = new FakeMessage();
    await new MediaSearch({ providers: { youtube: provider } }).search("youtube", "kucing", message);

    assert.deepEqual(provider.calls, [10]);
    const last = message.replies.at(-1)!;
    assert.ok(last.includes("(1-10)"), last);
    assert.ok(last.includes("1. Video 1"));
    assert.ok(last.includes("10. Video 10"));
    assert.ok(last.includes("tab lanjut"));
    assert.ok(last.includes("tab pilih"));
  });

  it("search: platform tanpa provider dibalas belum didukung", async () => {
    const message = new FakeMessage();
    await new MediaSearch({ providers: {} }).search("tiktok", "kucing", message);
    assert.ok(message.replies[0]?.includes("belum didukung"));
  });

  it("search: kata kunci kosong dibalas cara pakai", async () => {
    const provider = new FakeProvider();
    const message = new FakeMessage();
    await new MediaSearch({ providers: { youtube: provider } }).search("youtube", "   ", message);
    assert.equal(provider.calls.length, 0);
    assert.ok(message.replies[0]?.includes("Pakai: tab search-yt"));
  });

  it("lanjut: menampilkan 10 hasil berikutnya, lalu berhenti saat provider mentok", async () => {
    const provider = new FakeProvider();
    provider.available = 22;
    const search = new MediaSearch({ providers: { youtube: provider } });
    const message = new FakeMessage();

    await search.search("youtube", "kucing", message);
    await search.next(message);
    let last = message.replies.at(-1)!;
    assert.ok(last.includes("(11-20)"), last);

    await search.next(message);
    last = message.replies.at(-1)!;
    assert.ok(last.includes("(21-22)"), last);

    await search.next(message);
    last = message.replies.at(-1)!;
    assert.ok(last.includes("Sudah semua"), last);
    assert.equal(provider.calls.length, 3, "panggilan ke-3 tidak perlu refetch karena sudah tahu mentok");
  });

  it("lanjut: tanpa pencarian aktif dibalas penjelasan", async () => {
    const message = new FakeMessage();
    await new MediaSearch({ providers: {} }).next(message);
    assert.ok(message.replies[0]?.includes("Belum ada pencarian aktif"));
  });

  it("pilih: detail hasil yang sudah diambil, termasuk perintah dl yang disarankan", async () => {
    const provider = new FakeProvider();
    const search = new MediaSearch({ providers: { tiktok: provider } });
    const message = new FakeMessage();

    await search.search("tiktok", "kucing", message);
    await search.pick("3", message);

    const last = message.replies.at(-1)!;
    assert.ok(last.includes("Video 3"));
    assert.ok(last.includes("author3"));
    assert.ok(last.includes("https://example.com/3"));
    assert.ok(last.includes("tab dl-tiktok https://example.com/3"));
  });

  it("pilih: nomor di luar yang sudah diambil disuruh lanjut dulu", async () => {
    const provider = new FakeProvider();
    const search = new MediaSearch({ providers: { youtube: provider } });
    const message = new FakeMessage();

    await search.search("youtube", "kucing", message);
    await search.pick("15", message);

    assert.ok(message.replies.at(-1)?.includes('tab lanjut'));
  });

  it("pilih: masukan bukan angka ditolak", async () => {
    const provider = new FakeProvider();
    const search = new MediaSearch({ providers: { youtube: provider } });
    const message = new FakeMessage();

    await search.search("youtube", "kucing", message);
    await search.pick("abc", message);

    assert.ok(message.replies.at(-1)?.includes("Pakai: tab pilih"));
  });

  it("error dari provider dibalas, tidak melempar", async () => {
    const provider = new FakeProvider();
    provider.fail = new Error("yt-dlp gagal");
    const message = new FakeMessage();
    await new MediaSearch({ providers: { youtube: provider } }).search("youtube", "kucing", message);

    assert.ok(message.replies.at(-1)?.includes("yt-dlp gagal"));
  });
});
