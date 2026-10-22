import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProfileMediaKind, ProfileMediaStore } from "../domain/ports.ts";

const FILENAMES: Record<ProfileMediaKind, string> = {
  fotoprofile: "fotoprofile.jpg",
  videoprofile: "videoprofile.mp4",
  fotocover: "fotocover.jpg",
  videocover: "videocover.mp4",
};

/** Simpan media `tab saveprofile` dengan nama baku (default `./downloads`); tiap kali disimpan, menimpa yang lama. */
export class FileProfileMediaStore implements ProfileMediaStore {
  constructor(private readonly directory = "./downloads") {}

  async save(kind: ProfileMediaKind, data: Buffer): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, FILENAMES[kind]);
    await writeFile(path, data);
    return path;
  }
}
