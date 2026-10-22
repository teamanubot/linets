import { readFile, writeFile } from "node:fs/promises";
import type { ProfileSnapshot, ProfileSnapshotStore } from "../domain/ports.ts";

/** Snapshot `tab saveprofile` (satu slot, dipulihkan lewat `tab recovery`), disimpan sebagai JSON. */
export class FileProfileSnapshotStore implements ProfileSnapshotStore {
  constructor(private readonly path = "./.saveprofile-snapshot.json") {}

  async save(snapshot: ProfileSnapshot): Promise<void> {
    await writeFile(this.path, JSON.stringify(snapshot, null, 2));
  }

  async load(): Promise<ProfileSnapshot | null> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as ProfileSnapshot;
    } catch {
      return null;
    }
  }
}
