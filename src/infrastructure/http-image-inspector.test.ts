import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpImageInspector } from "./http-image-inspector.ts";

/** PNG minimal dengan chunk acTL (frame, plays) sebelum IDAT. */
function pngHead(animation?: { frames: number; plays: number }): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(280, 0);
  ihdr.writeUInt32BE(156, 4);
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(animation?.frames ?? 0, 0);
  actl.writeUInt32BE(animation?.plays ?? 0, 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), ...(animation ? [chunk("acTL", actl)] : []), chunk("IDAT", Buffer.alloc(4))]);
}

const respond = (body: Buffer, init: ResponseInit) => async () => new Response(new Uint8Array(body), init);

describe("HttpImageInspector", () => {
  it("APNG: ukuran total dari Content-Range, jumlah putaran dan frame dari acTL", async () => {
    const inspector = new HttpImageInspector(respond(pngHead({ frames: 23, plays: 0 }), { status: 206, headers: { "content-range": "bytes 0-4095/280984" } }));

    assert.deepEqual(await inspector.inspect("https://a.id/x.png"), { bytes: 280984, kind: "apng", plays: 0, frames: 23 });
  });

  it("APNG dengan putaran terbatas terbaca (stiker LINE 3 putaran)", async () => {
    const inspector = new HttpImageInspector(respond(pngHead({ frames: 20, plays: 3 }), { status: 200, headers: { "content-length": "84034" } }));

    assert.deepEqual(await inspector.inspect("https://a.id/x.png"), { bytes: 84034, kind: "apng", plays: 3, frames: 20 });
  });

  it("PNG biasa, GIF, JPEG, dan lainnya dikenali dari byte awal", async () => {
    const kinds = async (head: Buffer) => (await new HttpImageInspector(respond(head, { status: 200 })).inspect("https://a.id/x"))?.kind;

    assert.equal(await kinds(pngHead()), "png");
    assert.equal(await kinds(Buffer.from("GIF89a....")), "gif");
    assert.equal(await kinds(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
    assert.equal(await kinds(Buffer.from("<html>")), "other");
  });

  it("meminta hanya awal file (Range), dan gagal diam-diam (null) saat error atau status tidak ok", async () => {
    let requested: RequestInit | undefined;
    const spy = async (_url: string, init?: RequestInit) => {
      requested = init;
      return new Response("x", { status: 404 });
    };

    assert.equal(await new HttpImageInspector(spy).inspect("https://a.id/x.png"), null);
    assert.deepEqual((requested!.headers as Record<string, string>).Range, "bytes=0-4095");
    assert.equal(await new HttpImageInspector(async () => Promise.reject(new Error("offline"))).inspect("https://a.id/x.png"), null);
  });
});
