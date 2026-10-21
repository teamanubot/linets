import { loginWithAuthToken, loginWithQR, type Client, type InitOptions } from "@evex/linejs";
import type { FileStorage } from "@evex/linejs/storage";
import { createRequire } from "node:module";

// qrcode-terminal adalah paket CommonJS tanpa default export di tipenya.
const qrcode = createRequire(import.meta.url)("qrcode-terminal") as typeof import("qrcode-terminal");

const TOKEN_KEY = "authToken";

async function loginWithSavedToken(storage: FileStorage, options: InitOptions): Promise<Client | null> {
  const token = await storage.get(TOKEN_KEY);
  if (typeof token !== "string" || !token) return null;

  try {
    return await loginWithAuthToken(token, options);
  } catch {
    console.log("Token tersimpan tidak valid, login ulang dengan QR...");
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

/** Login memakai token tersimpan; kalau tidak ada/tidak valid, login dengan QR. */
export async function login(storage: FileStorage): Promise<Client> {
  const options: InitOptions = { device: "DESKTOPWIN", storage };
  return (await loginWithSavedToken(storage, options)) ?? (await loginWithQrCode(storage, options));
}
