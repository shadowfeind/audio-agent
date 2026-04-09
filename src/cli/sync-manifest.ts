import "dotenv/config";
import { parseUploadSyncArgs } from "../core/args";
import { requireEnv } from "../core/env";
import { syncManifestUploadsPipeline } from "../pipelines/sync-manifest";
import { createUploadThingProvider } from "../providers/uploadthing";

export async function runSyncManifestCli(argv = process.argv.slice(2)) {
  const args = parseUploadSyncArgs(
    argv,
    "Usage: npm run upload:exam1 -- <exam-json-path> <manifest-path> [--expected-count <n>]",
  );

  await syncManifestUploadsPipeline({
    ...args,
    uploadProvider: createUploadThingProvider(requireEnv("UPLOADTHING_TOKEN")),
  });

  console.log("Finished UploadThing sync.");
}

if (require.main === module) {
  runSyncManifestCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
