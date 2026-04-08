import "dotenv/config";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { UTApi } from "uploadthing/server";
import { collectStreamedAudio, mergeWavAudioSegments } from "./audio-utils";
import {
  createDeterministicSpeakerAssignmentsForAnyCount,
  hashString,
  parseSpeakerTurns,
  type SpeakerTurn,
  type SpeakerAssignment,
  type VoiceName,
} from "./speaker-utils";

type QuestionType =
  | "read_aloud"
  | "repeat_sentence"
  | "describe_image"
  | "retell_lecture"
  | "answer_short_question"
  | "summarize_group_discussion"
  | "respond_to_a_situation";

type AudioQuestionType =
  | "repeat_sentence"
  | "retell_lecture"
  | "answer_short_question"
  | "summarize_group_discussion"
  | "respond_to_a_situation";

type AccentCode = "en-US" | "en-GB" | "en-AU";

type QuestionPrompt = {
  passage?: string;
  question?: string;
  situation?: string;
};

type QuestionAsset = {
  kind?: string;
  url?: string;
  label?: string;
  transcript?: string | null;
};

type ExamQuestion = {
  questionType: QuestionType;
  title: string;
  prompt?: QuestionPrompt;
  assets?: QuestionAsset[];
};

type ExamFile = Array<{
  title?: string;
  questions?: ExamQuestion[];
}>;

type VoiceProfile = {
  voiceName: VoiceName;
  accentCode: AccentCode;
  accentLabel: string;
  speakingStyle: string;
  pacing: string;
};

type QuestionVoiceRule = {
  voices: VoiceName[];
  accents: AccentCode[];
  speakingStyle: string;
  pacing: string;
};

type SingleSpeakerPlan = {
  mode: "single";
  profile: VoiceProfile;
};

type MultiSpeakerPlan = {
  mode: "multi";
  accentCode: AccentCode;
  accentLabel: string;
  speakingStyle: string;
  pacing: string;
  speakerAssignments: SpeakerAssignment[];
};

type SpeechPlan = SingleSpeakerPlan | MultiSpeakerPlan;

type ManifestEntry = {
  index: number;
  title: string;
  questionType: QuestionType;
  originalAssetUrl: string | null;
  transcriptLength: number;
  speakerMode: "single" | "multi";
  speakerAssignments: SpeakerAssignment[] | null;
  voiceName: VoiceName | null;
  accent: AccentCode | null;
  outputFile: string | null;
  uploadedUrl: string | null;
  uploadedKey: string | null;
  status: "generated" | "skipped" | "failed";
  error: string | null;
};

type GeneratedAudio = Awaited<ReturnType<typeof collectStreamedAudio>>;

const MODEL = "gemini-2.5-pro-preview-tts";
const DEFAULT_OUTPUT_ROOT = path.resolve(__dirname, "generated", "speaking");
const ALL_ACCENTS: AccentCode[] = ["en-US", "en-GB", "en-AU"];
const DIALOGUE_VOICES: VoiceName[] = [
  "Kore",
  "Fenrir",
  "Enceladus",
  "Achernar",
  "Aoede",
  "Puck",
  "Algenib",
];
const AUDIO_QUESTION_TYPES = new Set<AudioQuestionType>([
  "repeat_sentence",
  "retell_lecture",
  "answer_short_question",
  "summarize_group_discussion",
  "respond_to_a_situation",
]);

const ACCENT_LABELS: Record<AccentCode, string> = {
  "en-US": "American English",
  "en-GB": "British English",
  "en-AU": "Australian English",
};

const QUESTION_VOICE_RULES: Record<AudioQuestionType, QuestionVoiceRule> = {
  repeat_sentence: {
    voices: ["Aoede", "Enceladus", "Achernar", "Algenib"],
    accents: ["en-US", "en-GB"],
    speakingStyle: "clear assessment sentence delivery",
    pacing: "moderate and precise",
  },
  retell_lecture: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear academic lecture narration",
    pacing: "moderate and natural",
  },
  answer_short_question: {
    voices: ["Aoede", "Enceladus", "Achernar", "Algenib"],
    accents: ["en-US", "en-GB"],
    speakingStyle: "clear assessment question delivery",
    pacing: "moderate and precise",
  },
  summarize_group_discussion: {
    voices: [
      "Aoede",
      "Kore",
      "Fenrir",
      "Enceladus",
      "Achernar",
      "Algenib",
      "Puck",
    ],
    accents: ALL_ACCENTS,
    speakingStyle: "clear academic panel discussion",
    pacing: "natural conversational",
  },
  respond_to_a_situation: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear spoken scenario prompt",
    pacing: "natural and direct",
  },
};

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "question"
  );
}

function createRng(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(items: T[], rng: () => number) {
  return items[Math.floor(rng() * items.length)]!;
}

function parseArgs(argv: string[]) {
  let examPath = "";
  let outputDir = "";
  let seedText = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--output" || arg === "-o") {
      outputDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--seed") {
      seedText = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (!examPath) {
      examPath = arg;
    }
  }

  if (!examPath) {
    throw new Error(
      "Usage: npm run generate:speaking -- <exam-json-path> [--output <dir>] [--seed <value>]",
    );
  }

  const resolvedExamPath = path.resolve(examPath);
  const normalizedSeed = seedText || `${resolvedExamPath}:${Date.now()}`;

  return {
    examPath: resolvedExamPath,
    outputDir: outputDir ? path.resolve(outputDir) : "",
    seedText: normalizedSeed,
  };
}

function isAudioQuestionType(
  questionType: QuestionType,
): questionType is AudioQuestionType {
  return AUDIO_QUESTION_TYPES.has(questionType as AudioQuestionType);
}

function getAudioAssetIndex(question: ExamQuestion) {
  const preferredIndex =
    question.assets?.findIndex((asset) => asset.kind === "audio") ?? -1;

  if (preferredIndex >= 0) {
    return preferredIndex;
  }

  return question.assets?.length ? 0 : -1;
}

function getDefaultAssetLabel(questionType: AudioQuestionType) {
  switch (questionType) {
    case "repeat_sentence":
      return "Sentence audio";
    case "retell_lecture":
      return "Lecture audio";
    case "answer_short_question":
      return "Question audio";
    case "summarize_group_discussion":
      return "Discussion audio";
    case "respond_to_a_situation":
      return "Situation prompt audio";
  }
}

function ensureAudioAsset(
  question: ExamQuestion,
  transcript: string,
): { asset: QuestionAsset; index: number; changed: boolean } {
  const existingIndex = getAudioAssetIndex(question);

  if (existingIndex >= 0) {
    const asset = question.assets?.[existingIndex];
    if (!asset) {
      throw new Error("Resolved audio asset index points to no asset.");
    }

    if (!asset.transcript?.trim()) {
      asset.transcript = transcript;
      return {
        asset,
        index: existingIndex,
        changed: true,
      };
    }

    return {
      asset,
      index: existingIndex,
      changed: false,
    };
  }

  if (!isAudioQuestionType(question.questionType)) {
    throw new Error(
      `Cannot create an audio asset for non-audio question type: ${question.questionType}`,
    );
  }

  const asset: QuestionAsset = {
    kind: "audio",
    label: getDefaultAssetLabel(question.questionType),
    transcript,
  };

  question.assets = [...(question.assets ?? []), asset];

  return {
    asset,
    index: question.assets.length - 1,
    changed: true,
  };
}

function resolveTranscript(question: ExamQuestion) {
  const audioAsset = (() => {
    const assetIndex = getAudioAssetIndex(question);
    if (assetIndex < 0) {
      return null;
    }
    return question.assets?.[assetIndex] ?? null;
  })();

  const assetTranscript = audioAsset?.transcript?.trim();
  if (assetTranscript) {
    return assetTranscript;
  }

  switch (question.questionType) {
    case "answer_short_question":
      return question.prompt?.question?.trim() ?? "";
    case "respond_to_a_situation":
      return question.prompt?.situation?.trim() ?? "";
    case "read_aloud":
      return question.prompt?.passage?.trim() ?? "";
    default:
      return "";
  }
}

function createVoiceProfile(
  questionType: AudioQuestionType,
  rng: () => number,
): VoiceProfile {
  const rule = QUESTION_VOICE_RULES[questionType];
  const voiceName = pickOne(rule.voices, rng);
  const accentCode = pickOne(rule.accents, rng);

  return {
    voiceName,
    accentCode,
    accentLabel: ACCENT_LABELS[accentCode],
    speakingStyle: rule.speakingStyle,
    pacing: rule.pacing,
  };
}

function createSpeechPlan(
  questionType: AudioQuestionType,
  transcript: string,
  seedText: string,
  rng: () => number,
): SpeechPlan {
  const rule = QUESTION_VOICE_RULES[questionType];
  const turns = parseSpeakerTurns(transcript);
  const speakers: string[] = [];

  for (const turn of turns) {
    if (!speakers.includes(turn.speaker)) {
      speakers.push(turn.speaker);
    }
  }

  if (speakers.length < 2) {
    return {
      mode: "single",
      profile: createVoiceProfile(questionType, rng),
    };
  }

  const accentSeed = hashString(`${seedText}:${transcript}:${questionType}:accent`);
  const accentCode = rule.accents[accentSeed % rule.accents.length]!;

  return {
    mode: "multi",
    accentCode,
    accentLabel: ACCENT_LABELS[accentCode],
    speakingStyle: rule.speakingStyle,
    pacing: rule.pacing,
    speakerAssignments: createDeterministicSpeakerAssignmentsForAnyCount(
      speakers,
      DIALOGUE_VOICES,
      seedText,
      transcript,
    ),
  };
}

async function synthesizeQuestionAudio(
  ai: GoogleGenAI,
  transcript: string,
  plan: SpeechPlan,
): Promise<GeneratedAudio> {
  if (plan.mode === "single") {
    return synthesizeSingleSpeakerAudio(
      ai,
      transcript,
      plan.profile.voiceName,
      plan.profile.accentLabel,
      plan.profile.speakingStyle,
      plan.profile.pacing,
    );
  }

  if (plan.speakerAssignments.length > 2) {
    return synthesizeSegmentedDialogueAudio(ai, transcript, plan);
  }

  const config = {
    temperature: 1,
    responseModalities: ["audio"],
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: plan.speakerAssignments.map(
          ({ speaker, voiceName }) => ({
            speaker,
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          }),
        ),
      },
    },
  };
  const promptText = [
    `Perform the following dialogue in ${plan.accentLabel}.`,
    `Use a ${plan.speakingStyle} tone and keep the pacing ${plan.pacing}.`,
    "Use the named speakers exactly as labeled in the transcript.",
    "Do not read the speaker labels aloud as narration.",
    "Render each speaker with a distinct natural voice.",
    "Read the dialogue content exactly as written.",
    transcript,
  ].join(" ");

  const response = await ai.models.generateContentStream({
    model: MODEL,
    config,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: promptText,
          },
        ],
      },
    ],
  });

  return collectStreamedAudio(response);
}

async function synthesizeSingleSpeakerAudio(
  ai: GoogleGenAI,
  transcript: string,
  voiceName: VoiceName,
  accentLabel: string,
  speakingStyle: string,
  pacing: string,
): Promise<GeneratedAudio> {
  const response = await ai.models.generateContentStream({
    model: MODEL,
    config: {
      temperature: 1,
      responseModalities: ["audio"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Speak in ${accentLabel}.`,
              `Use a ${speakingStyle} tone.`,
              `Keep the pacing ${pacing}.`,
              "Read the following transcript exactly as written.",
              transcript,
            ].join(" "),
          },
        ],
      },
    ],
  });

  return collectStreamedAudio(response);
}

async function synthesizeSegmentedDialogueAudio(
  ai: GoogleGenAI,
  transcript: string,
  plan: MultiSpeakerPlan,
): Promise<GeneratedAudio> {
  const turns = parseSpeakerTurns(transcript);

  if (turns.length === 0) {
    throw new Error(
      "Segmented dialogue synthesis requires labeled speaker turns in the transcript.",
    );
  }

  const voiceBySpeaker = new Map(
    plan.speakerAssignments.map(({ speaker, voiceName }) => [speaker, voiceName]),
  );
  const segments: Array<{ content: Buffer; silenceAfterMs?: number }> = [];

  for (const [index, turn] of turns.entries()) {
    segments.push({
      content: await synthesizeDialogueTurnAudio(ai, turn, plan, voiceBySpeaker),
      silenceAfterMs: index < turns.length - 1 ? 180 : 0,
    });
  }

  return mergeWavAudioSegments(segments);
}

async function synthesizeDialogueTurnAudio(
  ai: GoogleGenAI,
  turn: SpeakerTurn,
  plan: MultiSpeakerPlan,
  voiceBySpeaker: Map<string, VoiceName>,
) {
  const voiceName = voiceBySpeaker.get(turn.speaker);

  if (!voiceName) {
    throw new Error(`Missing voice assignment for speaker "${turn.speaker}".`);
  }

  const audio = await synthesizeSingleSpeakerAudio(
    ai,
    turn.text,
    voiceName,
    plan.accentLabel,
    plan.speakingStyle,
    plan.pacing,
  );

  if (audio.extension !== "wav") {
    throw new Error(
      `Segmented dialogue synthesis requires WAV output, received ${audio.extension}.`,
    );
  }

  return audio.content;
}

async function writeExamFile(examPath: string, examFile: ExamFile) {
  await writeFile(examPath, `${JSON.stringify(examFile, null, 2)}\n`, "utf8");
}

async function writeManifestFile(
  manifestPath: string,
  examTitle: string | null | undefined,
  examPath: string,
  seedText: string,
  manifest: ManifestEntry[],
) {
  await writeFile(
    manifestPath,
    `${JSON.stringify({ examTitle: examTitle ?? null, examPath, seed: seedText, generatedAt: new Date().toISOString(), items: manifest }, null, 2)}\n`,
    "utf8",
  );
}

async function uploadAudioFile(
  utapi: UTApi,
  fileName: string,
  audio: Awaited<ReturnType<typeof synthesizeQuestionAudio>>,
) {
  const file = new File([audio.content], fileName, { type: audio.mimeType });
  const upload = await utapi.uploadFiles(file);

  if (upload.error || !upload.data) {
    throw new Error(upload.error?.message || "UploadThing upload failed.");
  }

  return {
    url: upload.data.ufsUrl,
    key: upload.data.key,
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in the environment.");
  }

  const { examPath, outputDir, seedText } = parseArgs(process.argv.slice(2));
  const raw = await readFile(examPath, "utf8");
  const examFile = JSON.parse(raw) as ExamFile;
  const exam = examFile[0];

  if (!exam?.questions?.length) {
    throw new Error(
      "The exam JSON does not contain any questions in data[0].questions.",
    );
  }

  const examSlug = slugify(
    exam.title || path.basename(examPath, path.extname(examPath)),
  );
  const finalOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, examSlug);
  await mkdir(finalOutputDir, { recursive: true });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const utapi = process.env.UPLOADTHING_TOKEN
    ? new UTApi({ token: process.env.UPLOADTHING_TOKEN })
    : null;
  const rng = createRng(hashString(seedText));
  const manifest: ManifestEntry[] = [];
  const manifestPath = path.join(finalOutputDir, "manifest.json");

  for (const [index, question] of exam.questions.entries()) {
    const baseEntry: Omit<
      ManifestEntry,
      "outputFile" | "uploadedUrl" | "uploadedKey" | "status" | "error"
    > = {
      index: index + 1,
      title: question.title,
      questionType: question.questionType,
      originalAssetUrl: null,
      transcriptLength: 0,
      speakerMode: "single" as "single" | "multi",
      speakerAssignments: null as SpeakerAssignment[] | null,
      voiceName: null as VoiceName | null,
      accent: null as AccentCode | null,
    };

    if (!isAudioQuestionType(question.questionType)) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        uploadedUrl: null,
        uploadedKey: null,
        status: "skipped",
        error: "Question type does not require generated prompt audio.",
      });
      await writeManifestFile(
        manifestPath,
        exam.title,
        examPath,
        seedText,
        manifest,
      );
      continue;
    }

    const transcript = resolveTranscript(question);

    if (!transcript) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        uploadedUrl: null,
        uploadedKey: null,
        status: "skipped",
        error: "Missing transcript on audio asset and no prompt fallback was available.",
      });
      await writeManifestFile(
        manifestPath,
        exam.title,
        examPath,
        seedText,
        manifest,
      );
      continue;
    }

    const { asset, changed } = ensureAudioAsset(question, transcript);
    baseEntry.originalAssetUrl = asset.url ?? null;
    baseEntry.transcriptLength = transcript.length;

    if (changed) {
      await writeExamFile(examPath, examFile);
    }

    try {
      const plan = createSpeechPlan(
        question.questionType,
        transcript,
        seedText,
        rng,
      );
      baseEntry.speakerMode = plan.mode;
      baseEntry.speakerAssignments =
        plan.mode === "multi" ? plan.speakerAssignments : null;
      baseEntry.voiceName =
        plan.mode === "single" ? plan.profile.voiceName : null;
      baseEntry.accent =
        plan.mode === "single" ? plan.profile.accentCode : plan.accentCode;

      const audio = await synthesizeQuestionAudio(ai, transcript, plan);
      const fileName = `${String(index + 1).padStart(2, "0")}-${question.questionType}-${slugify(question.title)}.${audio.extension}`;
      const outputPath = path.join(finalOutputDir, fileName);
      await writeFile(outputPath, audio.content);

      let uploadedUrl: string | null = null;
      let uploadedKey: string | null = null;

      if (utapi) {
        const upload = await uploadAudioFile(utapi, fileName, audio);
        uploadedUrl = upload.url;
        uploadedKey = upload.key;
        asset.url = upload.url;
        await writeExamFile(examPath, examFile);
      }

      manifest.push({
        ...baseEntry,
        outputFile: outputPath,
        uploadedUrl,
        uploadedKey,
        status: "generated",
        error: null,
      });
      await writeManifestFile(
        manifestPath,
        exam.title,
        examPath,
        seedText,
        manifest,
      );

      const voiceLog =
        plan.mode === "single"
          ? `${plan.profile.voiceName}, ${plan.profile.accentCode}`
          : `${plan.speakerAssignments.map(({ speaker, voiceName }) => `${speaker}=${voiceName}`).join(", ")}, ${plan.accentCode}`;
      console.log(
        `Generated audio for question ${index + 1}: ${question.title} [${voiceLog}]`,
      );
    } catch (error) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        uploadedUrl: null,
        uploadedKey: null,
        status: "failed",
        error:
          error instanceof Error ? error.message : "Unknown generation error.",
      });
      await writeManifestFile(
        manifestPath,
        exam.title,
        examPath,
        seedText,
        manifest,
      );
      console.error(
        `Failed to generate audio for question ${index + 1}: ${question.title}`,
      );
    }
  }

  const successCount = manifest.filter(
    (entry) => entry.status === "generated",
  ).length;
  const failureCount = manifest.filter(
    (entry) => entry.status === "failed",
  ).length;
  const skippedCount = manifest.filter(
    (entry) => entry.status === "skipped",
  ).length;

  console.log(
    `Completed generation. Success: ${successCount}, Failed: ${failureCount}, Skipped: ${skippedCount}`,
  );
  console.log(`Seed used: ${seedText}`);
  console.log(`Manifest written to ${manifestPath}`);
  console.log(
    utapi
      ? "UploadThing sync enabled."
      : "UploadThing sync disabled. Set UPLOADTHING_TOKEN to upload and patch exam URLs.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
