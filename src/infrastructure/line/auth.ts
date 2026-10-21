import { loginWithAuthToken, loginWithQR, type Client, type InitOptions } from "@tab/linets";
import type { FileStorage } from "@tab/linets/storage";
import { createRequire } from "node:module";

// qrcode-terminal adalah paket CommonJS tanpa default export di tipenya.
const qrcode = createRequire(import.meta.url)("qrcode-terminal") as typeof import("qrcode-terminal");

const TOKEN_KEY = "authToken";

const REVOKED_SESSION_CODES = ["V3_TOKEN_CLIENT_LOGGED_OUT", "NOT_AUTHORIZED_DEVICE", "AUTHENTICATION_FAILED", "INVALID_TOKEN"];

/** Apakah error login berarti token tersimpan sudah tidak berlaku (bukan gangguan sementara). */
export function isSessionRevoked(error: unknown): boolean {
  const data = (error as { data?: { code?: string; reason?: string } } | null)?.data;
  const raw = `${data?.code ?? ""} ${data?.reason ?? ""} ${String(error)}`;
  return REVOKED_SESSION_CODES.some((code) => raw.includes(code));
}

async function loginWithSavedToken(storage: FileStorage, options: InitOptions): Promise<Client | null> {
  const token = await storage.get(TOKEN_KEY);
  if (typeof token !== "string" || !token) return null;

  try {
    return await loginWithAuthToken(token, options);
  } catch (error) {
    // Hanya sesi yang benar-benar dicabut server yang boleh jatuh ke QR; gangguan jaringan/pembatasan sesaat tidak.
    if (!isSessionRevoked(error)) throw error;
    console.log("Sesi tersimpan sudah dicabut oleh LINE (logout dari perangkat tertaut), login ulang dengan QR...");
    return null;
  }
}

async function loginWithQrCode(storage: FileStorage, options: InitOptions): Promise<Client> {
  const client = await loginWithQR(
    {
      onReceiveQRUrl(url) {
        console.log("Scan QR ini dengan aplikasi LINE (Pengaturan > Perangkat tertaut / scan QR):");
        qrcode.generate(url, { small: true });
        console.log(url);
      },
      onPincodeRequest(pin) {
        console.log(`Masukkan PIN ini di HP kamu: ${pin}`);
      },
    },
    options,
  );
  await storage.set(TOKEN_KEY, client.authToken);
  return client;
}

/** Pesan LINE "verifikasi identitas sementara tidak bisa dilakukan" (kode bawaannya menyesatkan: E2EE_GROUP_TOO_MANY_MEMBERS). */
const LOGIN_THROTTLED_HINTS = ["E2EE_GROUP_TOO_MANY_MEMBERS", "本人確認が一時的にできません"];

/** Ubah error login mentah menjadi pesan yang bisa dipahami; error lain diteruskan apa adanya. */
export function describeLoginError(error: unknown): Error {
  const raw = `${(error as { data?: { code?: string; reason?: string } })?.data?.code ?? ""} ${(error as { data?: { reason?: string } })?.data?.reason ?? ""} ${String(error)}`;
  if (LOGIN_THROTTLED_HINTS.some((hint) => raw.includes(hint))) {
    return new Error(
      "LINE sedang membatasi verifikasi login (\"verifikasi identitas sementara tidak bisa dilakukan\").\n" +
        "Biasanya karena terlalu sering mencoba login. Tunggu 30–60 menit atau lebih, lalu jalankan npm start lagi dan scan QR SEKALI saja.\n" +
        "Jangan scan berulang-ulang, karena bisa memperpanjang pembatasan.",
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Login memakai token tersimpan; kalau tidak ada/tidak valid, login dengan QR. */
export async function login(storage: FileStorage): Promise<Client> {
  const options: InitOptions = { device: "DESKTOPWIN", deviceName: "TeamAnuBot", storage };
  try {
    return (await loginWithSavedToken(storage, options)) ?? (await loginWithQrCode(storage, options));
  } catch (error) {
    throw describeLoginError(error);
  }
}
