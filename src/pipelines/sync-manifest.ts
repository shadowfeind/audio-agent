import { access } from "fs/promises";
import { constants as fsConstants } from "fs";
import mime from "mime";
import { getAudioAssetIndex, getImageAssetIndex } from "../domain/assets";
import type {
  ExamFile,
  ExamQuestion,
  ManifestFile,
  UploadManifestEntry,
} from "../domain/types";
import { readExamFile, writeExamFile, getPrimaryExamSection } from "../core/exam-repository";
import { writeManifestFile } from "../core/manifest-repository";
import type { UploadProvider } from "../providers/uploadthing";

async function assertFileExists(filePath: string) {
  await access(filePath, fsConstants.R_OK);
}

function getAssetIndexForQuestion(question: ExamQuestion) {
  const audioAssetIndex = getAudioAssetIndex(question);
  if (audioAssetIndex >= 0) {
    return audioAssetIndex;
  }

  const imageAssetIndex = getImageAssetIndex(question);
  if (imageAssetIndex >= 0) {
    return imageAssetIndex;
  }

  return -1;
}

function resolveMimeType(filePath: string) {
  return mime.getType(filePath) || "application/octet-stream";
}

async function preflight(params: {
  manifest: ManifestFile<UploadManifestEntry>;
  examFile: ExamFile;
  expectedCount?: number;
}) {
  const generatedItems = params.manifest.items.filter(
    (item) => item.status === "generated",
  );

  if (
    typeof params.expectedCount === "number" &&
    generatedItems.length !== params.expectedCount
  ) {
    throw new Error(
      `Expected ${params.expectedCount} generated manifest items, found ${generatedItems.length}.`,
    );
  }

  const exam = getPrimaryExamSection(params.examFile);
  const questions = exam.questions ?? [];

  for (const item of generatedItems) {
    if (!item.outputFile) {
      throw new Error(`Manifest item ${item.index} is missing outputFile.`);
    }

    await assertFileExists(item.outputFile);

    const question = questions[item.index - 1];
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

    if (getAssetIndexForQuestion(question) < 0) {
      throw new Error(`Question ${item.index} does not contain a patchable asset.`);
    }
  }
}

export async function syncManifestUploadsPipeline(params: {
  examPath: string;
  manifestPath: string;
  uploadProvider: UploadProvider;
  expectedCount?: number;
}) {
  const manifest = (await import("fs/promises").then(({ readFile }) =>
    readFile(params.manifestPath, "utf8"),
  ).then((raw) => JSON.parse(raw) as ManifestFile<UploadManifestEntry>));
  const examFile = await readExamFile(params.examPath);
  await preflight({
    manifest,
    examFile,
    expectedCount: params.expectedCount,
  });

  const exam = getPrimaryExamSection(examFile);
  const questions = exam.questions ?? [];

  for (const item of manifest.items) {
    if (item.status !== "generated" || !item.outputFile) {
      continue;
    }

    const question = questions[item.index - 1]!;
    const assetIndex = getAssetIndexForQuestion(question);
    const asset = question.assets?.[assetIndex];

    if (!asset) {
      throw new Error(`Missing asset for question ${item.index}.`);
    }

    try {
      const upload = await params.uploadProvider.uploadFilePath({
        filePath: item.outputFile,
        mimeType: resolveMimeType(item.outputFile),
      });
      asset.url = upload.url;
      item.uploadedUrl = upload.url;
      item.uploadedKey = upload.key;
      item.error = null;

      await writeExamFile(params.examPath, examFile);
      await writeManifestFile(params.manifestPath, manifest);
    } catch (error) {
      item.error =
        error instanceof Error ? error.message : "Unknown upload error.";
      await writeManifestFile(params.manifestPath, manifest);
    }
  }

  return {
    examPath: params.examPath,
    manifestPath: params.manifestPath,
  };
}
