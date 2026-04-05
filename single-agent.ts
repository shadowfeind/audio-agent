// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node

import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { collectStreamedAudio } from "./audio-utils";

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in the environment.");
  }

  const ai = new GoogleGenAI({
    apiKey: process.env["GEMINI_API_KEY"],
  });
  console.log(
    "Using API Key:",
    process.env["GEMINI_API_KEY"] ? "Found" : "Missing",
  );
  const config = {
    temperature: 1,
    responseModalities: ["audio"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: "Algieba",
        },
      },
    },
  };
  const model = "gemini-2.5-pro-preview-tts";
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `transcript goes here`,
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });
  console.log("Received response stream");

  const audio = await collectStreamedAudio(response);
  await mkdir(path.resolve(__dirname, "generated"), { recursive: true });

  const outputPath = path.resolve(
    __dirname,
    "generated",
    `single-agent-output.${audio.extension}`,
  );
  await writeFile(outputPath, audio.content);
  console.log(`Saved audio to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
