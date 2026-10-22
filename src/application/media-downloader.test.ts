import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { DownloadKind, FetchedMedia, FetchedMediaItem, MediaFetcher, MediaProcessor, MediaSender } from "../domain/ports.ts";
import { detectDownloadPlatform, MediaDownloader } from "./media-downloader.ts";
import { buf, FakeMessage } from "./test-doubles.ts";

describe("detectDownloadPlatform", () => {
  it("mengenali link dari kelima platform yang didukung", () => {
    const cases: Array<[string, string, string]> = [
      ["https://www.instagram.com/p/abc123/", "instagram", "Instagram"],
      ["https://instagram.com/reel/abc123/", "instagram", "Instagram"],
      ["https://twitter.com/user/status/123", "twitter", "Twitter/X"],
      ["https://x.com/user/status/123", "twitter", "Twitter/X"],
      ["https://www.facebook.com/user/videos/123", "facebook", "Facebook"],
      ["https://fb.watch/abc123/", "facebook", "Facebook"],
      ["https://www.tiktok.com/@user/video/123", "tiktok", "TikTok"],
      ["vm.tiktok.com/abc123", "tiktok", "TikTok"],
      ["https://www.youtube.com/watch?v=jNQXAC9IVRw", "youtube", "YouTube"],
      ["https://youtu.be/jNQXAC9IVRw", "youtube", "YouTube"],
    ];
    for (const [link, key, name] of cases) {
      assert.deepEqual(detectDownloadPlatform(link), { key, name, command: `dl-${key === "youtube" ? "yt" : key === "instagram" ? "ig" : key}` }, link);
    }
  });

  it("menolak link dari situs lain atau yang tidak valid", () => {
    for (const link of ["", "halo", "https://vimeo.com/12345678", "https://evil.com/instagram.com"]) {
      assert.equal(detectDownloadPlatform(link), null, link);
    }
  });
});

class FakeFetcher implements MediaFetcher {
  calls: Array<{ url: string; forceAudio: boolean }> = [];
  disposed = 0;
  fail: Error | null = null;
  result: { title: string; items: Array<{ kind: DownloadKind; content: string }> } = {
    title: "Judul Uji",
    items: [{ kind: "video", content: "isi-video" }],
  };
  private directory: string | null = null;

  async fetch(url: string, forceAudio = false): Promise<FetchedMedia> {
    this.calls.push({ url, forceAudio });
    if (this.fail) throw this.fail;

    this.directory = await mkdtemp(join(tmpdir(), "linebot-dl-test-"));
    const items: FetchedMediaItem[] = [];
    for (const [i, item] of this.result.items.entries()) {
      const path = join(this.directory, `item${i}.bin`);
      await writeFile(path, item.content);
      items.push({ path, kind: item.kind });
    }
    return {
      title: this.result.title,
      items,
      dispose: async () => {
        this.disposed++;
        if (this.directory) await rm(this.directory, { recursive: true, force: true });
      },
    };
  }
}

class FakeSender implements MediaSender {
  sent: string[] = [];
  async sendImage(chatId: string, image: Buffer) {
    this.sent.push(`image:${chatId}:${image}`);
  }
  async sendVideo(chatId: string, video: Buffer, durationMs: number) {
    this.sent.push(`video:${chatId}:${video}:${durationMs}`);
  }
  async sendAudio(chatId: string, audio: Buffer, durationMs: number) {
    this.sent.push(`audio:${chatId}:${audio}:${durationMs}`);
  }
}

const media: MediaProcessor = {
  toJpeg: async (image) => image,
  extractFrame: async (video) => video,
  trimVideo: async (video) => video,
  videoDurationMs: async () => 5000,
  toSquareVideo: async () => buf("persegi"),
};

describe("MediaDownloader", () => {
  it("menolak link yang tidak didukung dan menampilkan cara pakai perintah itu", async () => {
    const fetcher = new FakeFetcher();
    const message = new FakeMessage();
    await new MediaDownloader({ fetcher, sender: new FakeSender(), media }).run("https://vimeo.com/1", message, "youtube");

    assert.equal(fetcher.calls.length, 0);
    assert.ok(message.replies[0]?.includes("tab dl-yt"));
  });

  it("menolak link dari platform lain dan menunjuk perintah yang benar", async () => {
    const fetcher = new FakeFetcher();
    const message = new FakeMessage();
    await new MediaDownloader({ fetcher, sender: new FakeSender(), media }).run("https://youtu.be/jNQXAC9IVRw", message, "instagram");

    assert.equal(fetcher.calls.length, 0);
    assert.ok(message.replies[0]?.includes("tab dl-yt"));
    assert.ok(message.replies[0]?.includes("YouTube"));
  });

  it("postingan video: dideteksi otomatis lalu dikirim sebagai video dengan durasi", async () => {
    const fetcher = new FakeFetcher();
    const sender = new FakeSender();
    const message = new FakeMessage();
    await new MediaDownloader({ fetcher, sender, media }).run("https://youtu.be/jNQXAC9IVRw", message, "youtube");

    assert.deepEqual(fetcher.calls, [{ url: "https://youtu.be/jNQXAC9IVRw", forceAudio: false }]);
    assert.equal(sender.sent.length, 1);
    assert.ok(sender.sent[0]?.startsWith("video:cGROUP:"));
    assert.ok(sender.sent[0]?.endsWith(":5000"));
    assert.equal(fetcher.disposed, 1);
    assert.ok(message.replies.some((text) => text.includes("Judul Uji")));
  });

  it("dl-ytmp3: audio dipaksa lewat forceAudio, bukan deteksi otomatis", async () => {
    const fetcher = new FakeFetcher();
    fetcher.result = { title: "Lagu Uji", items: [{ kind: "audio", content: "isi-audio" }] };
    const sender = new FakeSender();
    const message = new FakeMessage();
    await new MediaDownloader({ fetcher, sender, media }).run("https://youtu.be/jNQXAC9IVRw", message, "youtube", true);

    assert.deepEqual(fetcher.calls, [{ url: "https://youtu.be/jNQXAC9IVRw", forceAudio: true }]);
    assert.ok(sender.sent[0]?.startsWith("audio:cGROUP:"));
  });

  it("postingan foto: dideteksi otomatis dan dikirim sebagai gambar tanpa probe durasi", async () => {
    const fetcher = new FakeFetcher();
    fetcher.result = { title: "Foto Uji", items: [{ kind: "image", content: "isi-gambar" }] };
    const sender = new FakeSender();
    const message = new FakeMessage();
    await new MediaDownloader({ fetcher, sender, media }).run("https://www.instagram.com/p/abc", message, "instagram");

    assert.deepEqual(fetcher.calls, [{ url: "https://www.instagram.com/p/abc", forceAudio: false }]);
    assert.deepEqual(sender.sent, [`image:cGROUP:${buf("isi-gambar")}`]);
    assert.ok(message.replies.at(-1)?.includes("foto"));
  });

  it("karusel: beberapa item campuran foto & video dikirim semuanya, urut sesuai slide", async () => {
    const fetcher = new FakeFetcher();
    fetcher.result = {
      title: "Karusel Uji",
      items: [
        { kind: "image", content: "slide-1" },
        { kind: "video", content: "slide-2" },
        { kind: "image", content: "slide-3" },
      ],
    };
    const sender = new FakeSender();
    const message = new FakeMessage();
    await new MediaDownloader({ fetcher, sender, media }).run("https://www.instagram.com/p/abc", message, "instagram");

    assert.deepEqual(sender.sent, [`image:cGROUP:${buf("slide-1")}`, `video:cGROUP:${buf("slide-2")}:5000`, `image:cGROUP:${buf("slide-3")}`]);
    const last = message.replies.at(-1)!;
    assert.ok(last.includes("3 item"), last);
    assert.ok(last.includes("1 video"), last);
    assert.ok(last.includes("2 foto"), last);
  });

  it("menolak dua unduhan sekaligus", async () => {
    const fetcher = new FakeFetcher();
    const sender = new FakeSender();
    const downloader = new MediaDownloader({ fetcher, sender, media });
    const message = new FakeMessage();

    const first = downloader.run("https://youtu.be/jNQXAC9IVRw", message, "youtube");
    await downloader.run("https://youtu.be/jNQXAC9IVRw", new FakeMessage(), "youtube");
    await first;

    assert.equal(fetcher.calls.length, 1);
  });

  it("error dari fetcher diteruskan dan tidak macet", async () => {
    const fetcher = new FakeFetcher();
    fetcher.fail = new Error("yt-dlp gagal");
    const downloader = new MediaDownloader({ fetcher, sender: new FakeSender(), media });

    await assert.rejects(downloader.run("https://youtu.be/jNQXAC9IVRw", new FakeMessage(), "youtube"), /yt-dlp gagal/);
  });
});
