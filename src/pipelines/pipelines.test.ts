import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { createWavHeader } from "../audio/audio-utils";
import { generateSpeakingAudioPipeline } from "./generate-speaking-audio";
import { generateImagesPipeline } from "./generate-images";
import { syncManifestUploadsPipeline } from "./sync-manifest";
import type {
  ExamFile,
  ManifestFile,
  UploadManifestEntry,
} from "../domain/types";

function createTempDir() {
  return mkdtemp(path.join(os.tmpdir(), "audio-agent-test-"));
}

function createWavAudio(contentByte: number) {
  const pcm = Buffer.from([contentByte, 0, contentByte + 1, 0]);
  return {
    extension: "wav",
    mimeType: "audio/wav",
    content: Buffer.concat([
      createWavHeader(pcm.length, {
        numChannels: 1,
        sampleRate: 24000,
        bitsPerSample: 16,
      }),
      pcm,
    ]),
  };
}

test("generateSpeakingAudioPipeline patches uploaded URLs and skips non-audio tasks", async () => {
  const tempDir = await createTempDir();
  const examPath = path.join(tempDir, "speaking.json");
  const exam: ExamFile = [
    {
      title: "Speaking",
      questions: [
        {
          title: "Read",
          questionType: "read_aloud",
          prompt: { passage: "Read this aloud." },
          assets: [],
        },
        {
          title: "Question",
          questionType: "answer_short_question",
          prompt: { question: "What is water?" },
          assets: [],
        },
      ],
    },
  ];
  await writeFile(examPath, `${JSON.stringify(exam, null, 2)}\n`, "utf8");

  const uploads: string[] = [];
  const result = await generateSpeakingAudioPipeline({
    examPath,
    outputDir: "",
    seedText: "seed-1",
    audioProvider: {
      async synthesizeSingleSpeakerAudio() {
        return createWavAudio(1);
      },
      async synthesizeMultiSpeakerAudio() {
        throw new Error("Multi-speaker should not be used in this test.");
      },
    },
    uploader: {
      async uploadBuffer({ fileName }) {
        uploads.push(fileName);
        return {
          url: `https://upload.example/${fileName}`,
          key: `key-${fileName}`,
        };
      },
      async uploadFilePath() {
        throw new Error("uploadFilePath should not be used in this test.");
      },
    },
  });

  assert.equal(result.manifest[0]?.status, "skipped");
  assert.equal(result.manifest[1]?.status, "generated");
  assert.equal(uploads.length, 1);

  const updatedExam = JSON.parse(await readFile(examPath, "utf8")) as ExamFile;
  const generatedQuestion = updatedExam[0]?.questions?.[1];
  assert.match(
    generatedQuestion?.assets?.[0]?.url ?? "",
    /^https:\/\/upload\.example\//,
  );
});

test("generateSpeakingAudioPipeline uses segmented fallback for three-speaker discussions", async () => {
  const tempDir = await createTempDir();
  const examPath = path.join(tempDir, "discussion.json");
  const exam: ExamFile = [
    {
      title: "Speaking",
      questions: [
        {
          title: "Discussion",
          questionType: "summarize_group_discussion",
          assets: [
            {
              kind: "audio",
              transcript:
                "Speaker 1: First point. Speaker 2: Second point. Speaker 3: Third point.",
            },
          ],
        },
      ],
    },
  ];
  await writeFile(examPath, `${JSON.stringify(exam, null, 2)}\n`, "utf8");

  let singleCalls = 0;
  let multiCalls = 0;
  await generateSpeakingAudioPipeline({
    examPath,
    outputDir: "",
    seedText: "seed-2",
    audioProvider: {
      async synthesizeSingleSpeakerAudio() {
        singleCalls += 1;
        return createWavAudio(singleCalls);
      },
      async synthesizeMultiSpeakerAudio() {
        multiCalls += 1;
        return createWavAudio(9);
      },
    },
  });

  assert.equal(singleCalls, 3);
  assert.equal(multiCalls, 0);
});

test("generateImagesPipeline patches uploaded image URLs and skips unrelated tasks", async () => {
  const tempDir = await createTempDir();
  const examPath = path.join(tempDir, "images.json");
  const exam: ExamFile = [
    {
      title: "Speaking",
      questions: [
        {
          title: "Repeat",
          questionType: "repeat_sentence",
          assets: [],
        },
        {
          title: "Chart",
          questionType: "describe_image",
          assets: [
            {
              kind: "image",
              altText: "A bar chart of population growth.",
              metadata: {
                imageInstruction: "Create a clean academic bar chart.",
              },
            },
          ],
        },
      ],
    },
  ];
  await writeFile(examPath, `${JSON.stringify(exam, null, 2)}\n`, "utf8");

  const result = await generateImagesPipeline({
    examPath,
    outputDir: "",
    imageProvider: {
      async generateImage() {
        return {
          extension: "png",
          mimeType: "image/png",
          content: Buffer.from([1, 2, 3, 4]),
        };
      },
    },
    uploader: {
      async uploadBuffer({ fileName }) {
        return {
          url: `https://images.example/${fileName}`,
          key: `key-${fileName}`,
        };
      },
      async uploadFilePath() {
        throw new Error("uploadFilePath should not be used in this test.");
      },
    },
  });

  assert.equal(result.manifest[0]?.status, "skipped");
  assert.equal(result.manifest[1]?.status, "generated");

  const updatedExam = JSON.parse(await readFile(examPath, "utf8")) as ExamFile;
  const describeImageQuestion = updatedExam[0]?.questions?.[1];
  assert.match(
    describeImageQuestion?.assets?.[0]?.url ?? "",
    /^https:\/\/images\.example\//,
  );
});

test("syncManifestUploadsPipeline uploads local outputs and patches the exam", async () => {
  const tempDir = await createTempDir();
  const examPath = path.join(tempDir, "listening.json");
  const outputPath = path.join(tempDir, "item.wav");
  const manifestPath = path.join(tempDir, "manifest.json");

  const exam: ExamFile = [
    {
      title: "Listening",
      questions: [
        {
          title: "Dictation",
          questionType: "write_from_dictation",
          assets: [{ kind: "audio", url: "https://example.com/old.wav" }],
        },
      ],
    },
  ];
  const manifest: ManifestFile<UploadManifestEntry> = {
    examTitle: "Listening",
    examPath,
    items: [
      {
        index: 1,
        title: "Dictation",
        questionType: "write_from_dictation",
        outputFile: outputPath,
        status: "generated",
        error: null,
      },
    ],
  };

  await writeFile(examPath, `${JSON.stringify(exam, null, 2)}\n`, "utf8");
  await writeFile(outputPath, createWavAudio(5).content);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await syncManifestUploadsPipeline({
    examPath,
    manifestPath,
    uploadProvider: {
      async uploadBuffer() {
        throw new Error("uploadBuffer should not be used in this test.");
      },
      async uploadFilePath({ filePath }) {
        assert.equal(filePath, outputPath);
        return {
          url: "https://sync.example/item.wav",
          key: "sync-key",
        };
      },
    },
    expectedCount: 1,
  });

  const updatedExam = JSON.parse(await readFile(examPath, "utf8")) as ExamFile;
  assert.equal(
    updatedExam[0]?.questions?.[0]?.assets?.[0]?.url,
    "https://sync.example/item.wav",
  );
});
