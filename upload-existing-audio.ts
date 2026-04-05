import "dotenv/config";
import { access, readFile, writeFile } from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";
import { UTApi } from "uploadthing/server";

type QuestionType =
  | "summarize_spoken_text"
  | "multiple_choice_multiple_answers"
  | "fill_in_the_blanks"
  | "highlight_correct_summary"
  | "multiple_choice_single_answer"
  | "select_missing_word"
  | "highlight_incorrect_words"
  | "write_from_dictation";

type QuestionAsset = {
  kind?: string;
  url?: string;
  transcript?: string | null;
};

type ExamQuestion = {
  title: string;
  questionType: QuestionType;
  assets?: QuestionAsset[];
};

type ExamFile = Array<{
  title?: string;
  questions?: ExamQuestion[];
}>;

type ManifestEntry = {
  index: number;
  title: string;
  questionType: QuestionType;
  outputFile: string | null;
  status: "generated" | "skipped" | "failed";
  error: string | null;
  uploadedUrl?: string | null;
  uploadedKey?: string | null;
};

type ManifestFile = {
  examTitle?: string | null;
  examPath: string;
  seed?: string;
  generatedAt?: string;
  items: ManifestEntry[];
};

const EXAM_PATH = "path to json";
const MANIFEST_PATH = "path to manifest";
const EXPECTED_COUNT = 15;

function normalizeToken(rawToken: string) {
  return rawToken.replace(/^['"]|['"]$/g, "");
}

function getAudioAssetIndex(question: ExamQuestion) {
  const preferredIndex =
    question.assets?.findIndex((asset) => asset.kind === "audio") ?? -1;
  if (preferredIndex >= 0) {
    return preferredIndex;
  }
  return question.assets?.length ? 0 : -1;
}

async function writeExamFile(examPath: string, examFile: ExamFile) {
  await writeFile(examPath, `${JSON.stringify(examFile, null, 2)}\n`, "utf8");
}

async function writeManifestFile(manifestPath: string, manifest: ManifestFile) {
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

async function assertFileExists(filePath: string) {
  await access(filePath, fsConstants.R_OK);
}

async function preflight(manifest: ManifestFile, examFile: ExamFile) {
  const generatedItems = manifest.items.filter(
    (item) => item.status === "generated",
  );
  if (generatedItems.length !== EXPECTED_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_COUNT} generated manifest items, found ${generatedItems.length}.`,
    );
  }

  const exam = examFile[0];
  if (!exam?.questions?.length) {
    throw new Error(
      "exam1.json does not contain questions in exam[0].questions.",
    );
  }

  if (exam.questions.length !== EXPECTED_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_COUNT} questions in exam1.json, found ${exam.questions.length}.`,
    );
  }

  for (const item of generatedItems) {
    if (!item.outputFile) {
      throw new Error(`Manifest item ${item.index} is missing outputFile.`);
    }

    await assertFileExists(item.outputFile);

    const question = exam.questions[item.index - 1];
    if (!question) {
      throw new Error(`No question found for manifest item ${item.index}.`);
    }

    if (question.title !== item.title) {
      throw new Error(
        `Title mismatch at item ${item.index}: manifest="${item.title}", exam="${question.title}"`,
      );
    }

    if (question.questionType !== item.questionType) {
      throw new Error(
        `Question type mismatch at item ${item.index}: manifest="${item.questionType}", exam="${question.questionType}"`,
      );
    }

    const assetIndex = getAudioAssetIndex(question);
    if (assetIndex < 0) {
      throw new Error(
        `Question ${item.index} does not contain an audio asset.`,
      );
    }
  }
}

async function uploadFile(utapi: UTApi, filePath: string) {
  const fileBuffer = await readFile(filePath);
  const file = new File([fileBuffer], path.basename(filePath), {
    type: "audio/wav",
  });
  const result = await utapi.uploadFiles(file);

  if (result.error || !result.data) {
    throw new Error(result.error?.message || "UploadThing upload failed.");
  }

  return {
    url: result.data.ufsUrl,
    key: result.data.key,
  };
}

async function main() {
  const token = process.env.UPLOADTHING_TOKEN
    ? normalizeToken(process.env.UPLOADTHING_TOKEN)
    : "";

  if (!token) {
    throw new Error("Missing UPLOADTHING_TOKEN in the environment.");
  }

  const manifestRaw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw) as ManifestFile;
  const examRaw = await readFile(EXAM_PATH, "utf8");
  const examFile = JSON.parse(examRaw) as ExamFile;
  await preflight(manifest, examFile);

  const utapi = new UTApi({ token });
  const exam = examFile[0]!;

  for (const item of manifest.items) {
    if (item.status !== "generated") {
      continue;
    }

    const question = exam.questions![item.index - 1]!;
    const assetIndex = getAudioAssetIndex(question);
    const outputFile = item.outputFile!;

    try {
      const upload = await uploadFile(utapi, outputFile);
      question.assets![assetIndex]!.url = upload.url;
      item.uploadedUrl = upload.url;
      item.uploadedKey = upload.key;
      item.error = null;

      await writeExamFile(EXAM_PATH, examFile);
      await writeManifestFile(MANIFEST_PATH, manifest);

      console.log(`Uploaded item ${item.index}: ${item.title}`);
    } catch (error) {
      item.error =
        error instanceof Error ? error.message : "Unknown upload error.";
      await writeManifestFile(MANIFEST_PATH, manifest);
      console.error(`Failed item ${item.index}: ${item.title}`);
    }
  }

  console.log("Finished UploadThing sync for exam1.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
