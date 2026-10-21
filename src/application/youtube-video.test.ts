import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { DownloadedVideo, MediaProcessor, SquareVideoOptions, VideoDownloader, VideoInfo } from "../domain/ports.ts";
import { MAX_OUTPUT_BYTES, parseYoutubeUrl, planVideoQuality, YoutubeVideo } from "./youtube-video.ts";
import { buf, FakeMessage, FakeProfile } from "./test-doubles.ts";

const ID = "jNQXAC9IVRw";
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

describe("parseYoutubeUrl", () => {
  it("menerima berbagai bentuk link YouTube dan membakukan URL-nya", () => {
    for (const link of [
      CANONICAL,
      `https://youtu.be/${ID}?si=abc`,
      `youtu.be/${ID}`,
      `https://m.youtube.com/watch?v=${ID}&list=PLxyz&t=10`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
    ]) {
      assert.equal(parseYoutubeUrl(link), CANONICAL, link);
    }
  });

  it("menolak situs lain, id tidak valid, dan masukan kosong", () => {
    for (const link of ["", "halo", "https://vimeo.com/12345678", "https://evil.com/watch?v=" + ID, `https://youtube.com.evil.com/watch?v=${ID}`, "https://www.youtube.com/watch?v=pendek", "https://www.youtube.com/"]) {
      assert.equal(parseYoutubeUrl(link), null, link);
    }
  });
});

class FakeDownloader implements VideoDownloader {
  calls: string[] = [];
  disposed = 0;
  infoResult: VideoInfo = { title: "Me at the zoo", durationSeconds: 19, maxHeight: 1080 };
  failDownload: Error | null = null;
  release: (() => void) | null = null;
  holdDownload = false;

  async info(url: string) {
    this.calls.push(`info:${url}`);
    return this.infoResult;
  }
  async download(url: string, maxHeight: number): Promise<DownloadedVideo> {
    this.calls.push(`download:${url}:${maxHeight}`);
    if (this.failDownload) throw this.failDownload;
    if (this.holdDownload) await new Promise<void>((resolve) => (this.release = resolve));
    return { path: "/tmp/sumber.mkv", dispose: async () => void this.disposed++ };
  }
}

/** Mencatat opsi yang diterima dan mengembalikan "klip" + penanda. */
let lastSquareOptions: SquareVideoOptions | null = null;
const fakeMedia: MediaProcessor = {
  toJpeg: async (image) => buf(`jpg(${image})`),
  extractFrame: async (video) => buf(`frame(${video})`),
  trimVideo: async (video) => video,
  videoDurationMs: async () => 1000,
  toSquareVideo: async (_path, options) => {
    lastSquareOptions = options;
    return buf(`klip#${options.mode}`);
  },
};

describe("planVideoQuality", () => {
  it("sumber 4K pendek: tetap 4K dengan bitrate yang diinginkan", () => {
    assert.deepEqual(planVideoQuality(2160, 60), { side: 2160, videoKbps: 16_000 });
  });

  it("sumber 1080p: hasil 1080 (tidak diperbesar)", () => {
    assert.deepEqual(planVideoQuality(1080, 60), { side: 1080, videoKbps: 5_000 });
  });

  it("4K yang lebih panjang turun tingkat supaya muat di batas upload", () => {
    const plan = planVideoQuality(2160, 300);
    assert.equal(plan.side, 1080);
    assert.ok(plan.videoKbps >= 2_500 && plan.videoKbps < 5_000);
  });

  it("video panjang sekali turun jauh dan ukuran perkiraan tetap di bawah batas", () => {
    for (const [height, seconds] of [[2160, 600], [1080, 600], [720, 600], [2160, 1800]] as const) {
      const { videoKbps } = planVideoQuality(height, seconds);
      const estimatedBytes = ((videoKbps + 128) * 1000 * seconds) / 8;
      assert.ok(estimatedBytes <= MAX_OUTPUT_BYTES * 1.001, `${height}p ${seconds}s: ${estimatedBytes}`);
    }
  });

  it("sumber resolusi rendah memakai tingkat terkecil", () => {
    assert.equal(planVideoQuality(240, 19).side, 480);
    assert.equal(planVideoQuality(360, 19).side, 480);
  });
});

describe("YoutubeVideo", () => {
  let downloader: FakeDownloader;
  let profile: FakeProfile;
  let service: YoutubeVideo;

  beforeEach(() => {
    downloader = new FakeDownloader();
    profile = new FakeProfile();
    service = new YoutubeVideo({ downloader, profile, media: fakeMedia, maxDurationSeconds: 3600 });
  });

  it("mengunduh lalu mengganti video profil saja (foto tetap)", async () => {
    const message = new FakeMessage();
    await service.setAsProfileVideo(`https://youtu.be/${ID}`, message);

    assert.deepEqual(downloader.calls, [`info:${CANONICAL}`, `download:${CANONICAL}:1080`]);
    assert.deepEqual(profile.calls, ["setVideoKeepImage:klip#fit"]);
    assert.deepEqual(lastSquareOptions, { mode: "fit", side: 1080, videoKbps: 5000 });
    assert.equal(downloader.disposed, 1);
    assert.match(message.replies[0]!, /Mengunduh "Me at the zoo" \(0:19\), kualitas sumber 1080p\.\nHasil: persegi 1080×1080\./);
    assert.match(message.replies[1]!, /Memproses video jadi persegi \(seluruh gambar dimuat\), suara dipertahankan/);
    assert.match(message.replies[2]!, /Berhasil.*1080×1080.*dengan suara.*foto profil tidak diubah.*dihapus/);
  });

  it("opsi 'foto': frame video dijadikan foto profil", async () => {
    const message = new FakeMessage();
    await service.setAsProfileVideo(`${CANONICAL} FOTO`, message);

    assert.deepEqual(profile.calls, ["setVideo:klip#fit+frame(klip#fit)"]);
    assert.match(message.replies.at(-1)!, /foto profil diambil dari video/);
  });

  it("opsi 'potong': video dipotong tengah, dan opsi bisa digabung dalam urutan apa pun", async () => {
    const message = new FakeMessage();
    await service.setAsProfileVideo(`${CANONICAL} Potong foto`, message);

    assert.deepEqual(profile.calls, ["setVideo:klip#crop+frame(klip#crop)"]);
    assert.match(message.replies[1]!, /dipotong tengah/);
  });

  it("link tidak valid: beri petunjuk dan tidak mengunduh", async () => {
    const message = new FakeMessage();
    await service.setAsProfileVideo("https://vimeo.com/123", message);

    assert.deepEqual(downloader.calls, []);
    assert.match(message.replies[0]!, /Pakai: tab vpl/);
  });

  it("video melebihi batas durasi ditolak sebelum diunduh", async () => {
    downloader.infoResult = { title: "Panjang", durationSeconds: 3725, maxHeight: 1080 };
    const message = new FakeMessage();
    await service.setAsProfileVideo(CANONICAL, message);

    assert.deepEqual(downloader.calls, [`info:${CANONICAL}`]);
    assert.deepEqual(profile.calls, []);
    assert.match(message.replies[0]!, /terlalu panjang \(62:05\)\. Maksimal 60:00/);
  });

  it("4K panjang: pesan memberi tahu kualitas diturunkan", async () => {
    downloader.infoResult = { title: "Alam 4K", durationSeconds: 55, maxHeight: 2160 };
    const message = new FakeMessage();
    service = new YoutubeVideo({ downloader, profile, media: fakeMedia, maxDurationSeconds: 900 });
    await service.setAsProfileVideo(CANONICAL, message);
    assert.match(message.replies[0]!, /kualitas sumber 2160p\.\nHasil: persegi 2160×2160\./);
    assert.doesNotMatch(message.replies[0]!, /diturunkan/);

    downloader.infoResult = { title: "Alam 4K", durationSeconds: 420, maxHeight: 2160 };
    const longer = new FakeMessage();
    await service.setAsProfileVideo(CANONICAL, longer);
    assert.match(longer.replies[0]!, /Hasil: persegi 1080×1080 \(diturunkan agar muat di batas upload LINE\)/);
  });

  it("gagal mengunduh: error diteruskan dan layanan bisa dipakai lagi", async () => {
    downloader.failDownload = new Error("Video unavailable");
    await assert.rejects(service.setAsProfileVideo(CANONICAL, new FakeMessage()), /Video unavailable/);
    assert.deepEqual(profile.calls, []);

    downloader.failDownload = null;
    const again = new FakeMessage();
    await service.setAsProfileVideo(CANONICAL, again);
    assert.deepEqual(profile.calls, ["setVideoKeepImage:klip#fit"]);
  });

  it("hanya satu proses sekaligus", async () => {
    downloader.holdDownload = true;
    const first = new FakeMessage();
    const running = service.setAsProfileVideo(CANONICAL, first);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = new FakeMessage();
    await service.setAsProfileVideo(CANONICAL, second);
    assert.match(second.replies[0]!, /Masih memproses/);

    downloader.release?.();
    await running;
    assert.deepEqual(profile.calls, ["setVideoKeepImage:klip#fit"]);
  });
});
