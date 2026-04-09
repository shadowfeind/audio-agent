import "dotenv/config";
import { parseGenerationArgs } from "../core/args";
import { requireEnv, getOptionalToken, logEnvStatus } from "../core/env";
import { generateSpeakingAudioPipeline } from "../pipelines/generate-speaking-audio";
import { createGeminiAudioProvider } from "../providers/gemini-audio";
import { createUploadThingProvider } from "../providers/uploadthing";

export async function runSpeakingCli(argv = process.argv.slice(2)) {
  const args = parseGenerationArgs(argv, {
    usage:
      "Usage: npm run generate:speaking -- <exam-json-path> [--output <dir>] [--seed <value>]",
    allowSeed: true,
  });
  const uploadToken = getOptionalToken("UPLOADTHING_TOKEN");
  logEnvStatus("GEMINI_API_KEY");
  logEnvStatus("UPLOADTHING_TOKEN");
  const audioProvider = createGeminiAudioProvider(requireEnv("GEMINI_API_KEY"));
  const uploader = uploadToken ? createUploadThingProvider(uploadToken) : undefined;

  const result = await generateSpeakingAudioPipeline({
    ...args,
    audioProvider,
    uploader,
  });
  const successCount = result.manifest.filter((entry) => entry.status === "generated").length;
  const failureCount = result.manifest.filter((entry) => entry.status === "failed").length;
  const skippedCount = result.manifest.filter((entry) => entry.status === "skipped").length;

  console.log(
    `Completed generation. Success: ${successCount}, Failed: ${failureCount}, Skipped: ${skippedCount}`,
  );
  console.log(`Seed used: ${args.seedText}`);
  console.log(`Manifest written to ${result.manifestPath}`);
  console.log(
    uploader
      ? "UploadThing sync enabled."
      : "UploadThing sync disabled. Set UPLOADTHING_TOKEN to upload and patch exam URLs.",
  );
}

if (require.main === module) {
  runSpeakingCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
