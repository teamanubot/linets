import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeLoginError, isSessionRevoked } from "./auth.ts";

describe("describeLoginError", () => {
  it("pembatasan verifikasi LINE (kode menyesatkan atau teks Jepang) dijelaskan dalam bahasa Indonesia", () => {
    const byCode = Object.assign(new Error("x"), { data: { code: "E2EE_GROUP_TOO_MANY_MEMBERS", reason: "" } });
    const byText = Object.assign(new Error("x"), { data: { reason: "本人確認が一時的にできません。\nしばらくしてからもう一度お試しください。" } });

    for (const error of [byCode, byText]) {
      const friendly = describeLoginError(error);
      assert.match(friendly.message, /membatasi verifikasi login/);
      assert.match(friendly.message, /scan QR SEKALI saja/);
      assert.doesNotMatch(friendly.message, /E2EE_GROUP_TOO_MANY_MEMBERS/);
    }
  });

  it("error lain diteruskan apa adanya", () => {
    const other = new Error("jaringan putus");
    assert.equal(describeLoginError(other), other);
    assert.equal(describeLoginError("teks biasa").message, "teks biasa");
  });
});

describe("isSessionRevoked", () => {
  it("sesi yang dicabut server dikenali", () => {
    const revoked = Object.assign(new Error("x"), { data: { code: "NOT_AUTHORIZED_DEVICE", reason: "V3_TOKEN_CLIENT_LOGGED_OUT" } });
    assert.equal(isSessionRevoked(revoked), true);
    assert.equal(isSessionRevoked(new Error("... AUTHENTICATION_FAILED ...")), true);
  });

  it("gangguan jaringan atau pembatasan sesaat bukan sesi dicabut (tidak boleh jatuh ke QR)", () => {
    assert.equal(isSessionRevoked(new Error("fetch failed")), false);
    assert.equal(isSessionRevoked(Object.assign(new Error("x"), { data: { code: "E2EE_GROUP_TOO_MANY_MEMBERS" } })), false);
    assert.equal(isSessionRevoked(null), false);
  });
});
