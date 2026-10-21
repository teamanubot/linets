import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_SETTINGS, type BotSettings, type SettingsStore } from "../domain/ports.ts";

/** Pengaturan bot disimpan sebagai JSON (default `./.settings.json`). */
export class FileSettingsStore implements SettingsStore {
  constructor(private readonly path = "./.settings.json") {}

  async load(): Promise<BotSettings> {
    try {
      const saved = JSON.parse(await readFile(this.path, "utf8")) as Partial<BotSettings>;
      return {
        autoReply: { ...DEFAULT_SETTINGS.autoReply, ...saved.autoReply },
        antiUnsend: { ...DEFAULT_SETTINGS.antiUnsend, ...saved.antiUnsend },
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  async save(settings: BotSettings): Promise<void> {
    await writeFile(this.path, JSON.stringify(settings, null, 2));
  }
}
