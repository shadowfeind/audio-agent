import "dotenv/config";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { requireEnv } from "../core/env";
import { createGeminiAudioProvider } from "../providers/gemini-audio";

export async function runSingleSampleCli() {
  const provider = createGeminiAudioProvider(requireEnv("GEMINI_API_KEY"));
  const audio = await provider.synthesizeSingleSpeakerAudio(
    "transcript goes here",
    {
      mode: "single",
      profile: {
        voiceName: "Algenib",
        accentCode: "en-US",
        accentLabel: "American English",
        speakingStyle: "clear demonstration narration",
        pacing: "moderate and natural",
      },
    },
  );

  await mkdir(path.resolve(__dirname, "..", "..", "generated"), { recursive: true });
  const outputPath = path.resolve(
    __dirname,
    "..",
    "..",
    "generated",
    `single-agent-output.${audio.extension}`,
  );
  await writeFile(outputPath, audio.content);
  console.log(`Saved audio to ${outputPath}`);
}

if (require.main === module) {
  runSingleSampleCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
