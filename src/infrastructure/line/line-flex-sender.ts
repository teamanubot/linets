import type { Client } from "@tab/linets";
import type { FlexSender } from "../../domain/ports.ts";

/**
 * Kirim Flex Message lewat LIFF. Kirim langsung `contentType FLEX` ditolak server (INCOMPATIBLE_APP_VERSION),
 * sedangkan LIFF memakai token LIFF dan endpoint api.line.me/message/v3/share atas nama akun.
 *
 * LINEJS mengabaikan opsi `liffId` di `liff.shareMessage`; id yang dipakai hanya yang diatur lewat `setDefaultLiffId`.
 */
export class LineFlexSender implements FlexSender {
  constructor(
    private readonly client: Client,
    /** Tunggu sebelum mencoba ulang kalau kena batas kecepatan LINE. */
    private readonly retryDelayMs = 8000,
  ) {}

  async send(chatId: string, liffId: string, altText: string, contents: Record<string, unknown>): Promise<void> {
    this.client.liff.setDefaultLiffId(liffId);
    const share = () => this.client.liff.shareMessage(chatId, { type: "flex", altText, contents });
    try {
      try {
        await share();
      } catch (error) {
        if (!isRateLimited(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        await share();
      }
    } catch (error) {
      throw describeFlexError(error, liffId);
    }
  }
}

function isRateLimited(error: unknown): boolean {
  const detail = (error as { data?: { message?: string } } | null)?.data?.message ?? "";
  return /rate\s?limit/i.test(`${detail} ${error instanceof Error ? error.message : String(error)}`);
}

/** Ubah error LIFF mentah jadi pesan yang bisa ditindaklanjuti. */
export function describeFlexError(error: unknown, liffId: string): Error {
  const detail = (error as { data?: { message?: string } } | null)?.data?.message ?? "";
  const reason = error instanceof Error ? error.message : String(error);

  if (detail.includes("INVALID_RECEIVER")) {
    return new Error("Flex tidak bisa dikirim ke chat dengan diri sendiri (Notes). Pakai di chat dengan orang lain atau di grup.");
  }
  if (isRateLimited(error)) {
    return new Error("LINE membatasi kecepatan kirim Flex (rate limit). Tunggu sekitar satu menit lalu coba lagi, dan kirim kartu satu per satu.");
  }
  if (reason.includes("Failed to get LiffToken")) {
    return new Error(
      `Token LIFF ${liffId} tidak bisa didapat. Periksa: id benar, channel LINE Login berstatus Published (atau akunmu terdaftar sebagai ` +
        "tester), dan persetujuan izin LIFF app berhasil.",
    );
  }
  return new Error(`Flex gagal dikirim lewat LIFF ${liffId}: ${detail || reason}`);
}
