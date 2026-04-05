import "dotenv/config";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { collectStreamedAudio } from "./audio-utils";

type QuestionType =
  | "summarize_spoken_text"
  | "multiple_choice_multiple_answers"
  | "fill_in_the_blanks"
  | "highlight_correct_summary"
  | "multiple_choice_single_answer"
  | "select_missing_word"
  | "highlight_incorrect_words"
  | "write_from_dictation";

type AccentCode = "en-US" | "en-GB" | "en-AU";
type VoiceName = "Aoede" | "Puck" | "Kore" | "Fenrir" | "Enceladus" | "Achernar" | "Algenib";

type ExamQuestion = {
  questionType: QuestionType;
  title: string;
  assets?: Array<{
    kind?: string;
    url?: string;
    transcript?: string | null;
  }>;
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

type ManifestEntry = {
  index: number;
  title: string;
  questionType: QuestionType;
  originalAssetUrl: string | null;
  transcriptLength: number;
  voiceName: VoiceName | null;
  accent: AccentCode | null;
  outputFile: string | null;
  status: "generated" | "skipped" | "failed";
  error: string | null;
};

const MODEL = "gemini-2.5-pro-preview-tts";
const DEFAULT_OUTPUT_ROOT = path.resolve(__dirname, "generated", "listening");
const ALL_ACCENTS: AccentCode[] = ["en-US", "en-GB", "en-AU"];

const ACCENT_LABELS: Record<AccentCode, string> = {
  "en-US": "American English",
  "en-GB": "British English",
  "en-AU": "Australian English",
};

const QUESTION_VOICE_RULES: Record<QuestionType, QuestionVoiceRule> = {
  summarize_spoken_text: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear academic lecture narration",
    pacing: "moderate and measured",
  },
  multiple_choice_multiple_answers: {
    voices: ["Aoede", "Kore", "Fenrir", "Enceladus", "Achernar", "Algenib", "Puck"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear academic discussion narration",
    pacing: "natural conversational",
  },
  fill_in_the_blanks: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear lecture delivery",
    pacing: "moderate with distinct word separation",
  },
  highlight_correct_summary: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear lecture summary narration",
    pacing: "moderate and natural",
  },
  multiple_choice_single_answer: {
    voices: ["Aoede", "Kore", "Fenrir", "Enceladus", "Achernar", "Algenib", "Puck"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear academic briefing",
    pacing: "natural conversational",
  },
  select_missing_word: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear explanatory speech",
    pacing: "natural with a slight pause before the ending",
  },
  highlight_incorrect_words: {
    voices: ["Aoede", "Kore", "Fenrir", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear factual narration",
    pacing: "moderate and precise",
  },
  write_from_dictation: {
    voices: ["Aoede", "Enceladus", "Achernar", "Algenib"],
    accents: ["en-US", "en-GB"],
    speakingStyle: "clear assessment dictation",
    pacing: "slightly slower than natural speech",
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "question";
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
    throw new Error("Usage: npm run generate:listening -- <exam-json-path> [--output <dir>] [--seed <value>]");
  }

  const resolvedExamPath = path.resolve(examPath);
  const normalizedSeed = seedText || `${resolvedExamPath}:${Date.now()}`;

  return {
    examPath: resolvedExamPath,
    outputDir: outputDir ? path.resolve(outputDir) : "",
    seedText: normalizedSeed,
  };
}

function createVoiceProfile(questionType: QuestionType, rng: () => number): VoiceProfile {
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

async function synthesizeQuestionAudio(ai: GoogleGenAI, transcript: string, profile: VoiceProfile) {
  const response = await ai.models.generateContentStream({
    model: MODEL,
    config: {
      temperature: 1,
      responseModalities: ["audio"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: profile.voiceName,
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
              `Speak in ${profile.accentLabel}.`,
              `Use a ${profile.speakingStyle} tone.`,
              `Keep the pacing ${profile.pacing}.`,
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

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in the environment.");
  }

  const { examPath, outputDir, seedText } = parseArgs(process.argv.slice(2));
  const raw = await readFile(examPath, "utf8");
  const examFile = JSON.parse(raw) as ExamFile;
  const exam = examFile[0];

  if (!exam?.questions?.length) {
    throw new Error("The exam JSON does not contain any questions in data[0].questions.");
  }

  const examSlug = slugify(exam.title || path.basename(examPath, path.extname(examPath)));
  const finalOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, examSlug);
  await mkdir(finalOutputDir, { recursive: true });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const rng = createRng(hashString(seedText));
  const manifest: ManifestEntry[] = [];

  for (const [index, question] of exam.questions.entries()) {
    const asset = question.assets?.find((entry) => entry.kind === "audio") ?? question.assets?.[0];
    const transcript = asset?.transcript?.trim();
    const rule = QUESTION_VOICE_RULES[question.questionType];

    const baseEntry = {
      index: index + 1,
      title: question.title,
      questionType: question.questionType,
      originalAssetUrl: asset?.url ?? null,
      transcriptLength: transcript?.length ?? 0,
      voiceName: null as VoiceName | null,
      accent: null as AccentCode | null,
    };

    if (!rule) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        status: "failed",
        error: `Unsupported question type: ${question.questionType}`,
      });
      continue;
    }

    const profile = createVoiceProfile(question.questionType, rng);
    baseEntry.voiceName = profile.voiceName;
    baseEntry.accent = profile.accentCode;

    if (!transcript) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        status: "skipped",
        error: "Missing transcript on audio asset.",
      });
      continue;
    }

    try {
      const audio = await synthesizeQuestionAudio(ai, transcript, profile);
      const fileName = `${String(index + 1).padStart(2, "0")}-${question.questionType}-${slugify(question.title)}.${audio.extension}`;
      const outputPath = path.join(finalOutputDir, fileName);
      await writeFile(outputPath, audio.content);

      manifest.push({
        ...baseEntry,
        outputFile: outputPath,
        status: "generated",
        error: null,
      });
      console.log(`Generated audio for question ${index + 1}: ${question.title} [${profile.voiceName}, ${profile.accentCode}]`);
    } catch (error) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown generation error.",
      });
      console.error(`Failed to generate audio for question ${index + 1}: ${question.title}`);
    }
  }

  const manifestPath = path.join(finalOutputDir, "manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify({ examTitle: exam.title ?? null, examPath, seed: seedText, generatedAt: new Date().toISOString(), items: manifest }, null, 2)}\n`,
    "utf8",
  );

  const successCount = manifest.filter((entry) => entry.status === "generated").length;
  const failureCount = manifest.filter((entry) => entry.status === "failed").length;
  const skippedCount = manifest.filter((entry) => entry.status === "skipped").length;

  console.log(`Completed generation. Success: ${successCount}, Failed: ${failureCount}, Skipped: ${skippedCount}`);
  console.log(`Seed used: ${seedText}`);
  console.log(`Manifest written to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
