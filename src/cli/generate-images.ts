import "dotenv/config";
import { parseGenerationArgs } from "../core/args";
import { requireEnv, getOptionalToken } from "../core/env";
import { generateImagesPipeline } from "../pipelines/generate-images";
import { createGeminiImageProvider } from "../providers/gemini-image";
import { createUploadThingProvider } from "../providers/uploadthing";

export async function runImagesCli(argv = process.argv.slice(2)) {
  const args = parseGenerationArgs(argv, {
    usage:
      "Usage: npm run generate:images -- <exam-json-path> [--output <dir>]",
    allowSeed: false,
  });
  const imageProvider = createGeminiImageProvider(requireEnv("GEMINI_API_KEY"));
  const uploadToken = getOptionalToken("UPLOADTHING_TOKEN");
  const uploader = uploadToken ? createUploadThingProvider(uploadToken) : undefined;

  const result = await generateImagesPipeline({
    examPath: args.examPath,
    outputDir: args.outputDir,
    imageProvider,
    uploader,
    model: process.env.GEMINI_IMAGE_MODEL || undefined,
  });
  const successCount = result.manifest.filter((entry) => entry.status === "generated").length;
  const failureCount = result.manifest.filter((entry) => entry.status === "failed").length;
  const skippedCount = result.manifest.filter((entry) => entry.status === "skipped").length;

  console.log(
    `Completed image generation. Success: ${successCount}, Failed: ${failureCount}, Skipped: ${skippedCount}`,
  );
  console.log(`Manifest written to ${result.manifestPath}`);
  console.log(
    uploader
      ? "UploadThing sync enabled."
      : "UploadThing sync disabled. Set UPLOADTHING_TOKEN to upload and patch exam URLs.",
  );
}

if (require.main === module) {
  runImagesCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
