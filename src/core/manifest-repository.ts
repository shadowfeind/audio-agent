import { writeFile } from "fs/promises";
import type { ManifestFile } from "../domain/types";

export async function writeManifestFile<TEntry>(
  manifestPath: string,
  manifest: ManifestFile<TEntry>,
) {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
