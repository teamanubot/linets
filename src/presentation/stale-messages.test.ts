import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFromBeforeStart, STALE_TOLERANCE_MS } from "./stale-messages.ts";

describe("isFromBeforeStart", () => {
  const startedAt = 1_000_000;

  it("pesan lama sebelum bot menyala dianggap basi", () => {
    assert.equal(isFromBeforeStart(startedAt - 80_000, startedAt), true);
    assert.equal(isFromBeforeStart(startedAt - STALE_TOLERANCE_MS - 1, startedAt), true);
  });

  it("pesan di dalam toleransi atau sesudah bot menyala diproses", () => {
    assert.equal(isFromBeforeStart(startedAt - STALE_TOLERANCE_MS, startedAt), false);
    assert.equal(isFromBeforeStart(startedAt - 1_000, startedAt), false);
    assert.equal(isFromBeforeStart(startedAt + 5_000, startedAt), false);
  });

  it("waktu tidak valid tidak membuat pesan dibuang", () => {
    assert.equal(isFromBeforeStart(Number.NaN, startedAt), false);
  });
});
