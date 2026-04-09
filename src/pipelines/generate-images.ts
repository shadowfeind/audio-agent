import path from "path";
import { buildImagePrompt, ensureDescribeImageAsset, inferAspectRatio, resolveImageInstruction } from "../domain/describe-image";
import type { ExamQuestion, ImageManifestEntry } from "../domain/types";
import { slugify } from "../core/helpers";
import { getPrimaryExamSection, readExamFile, writeExamFile } from "../core/exam-repository";
import { writeManifestFile } from "../core/manifest-repository";
import { ensureOutputDir, resolveOutputDir, writeBinaryFile } from "../core/output";
import type { GeminiImageProvider } from "../providers/gemini-image";
import type { UploadProvider } from "../providers/uploadthing";

function isDescribeImageQuestion(question: ExamQuestion) {
  return question.questionType === "describe_image";
}

export async function generateImagesPipeline(params: {
  examPath: string;
  outputDir: string;
  imageProvider: GeminiImageProvider;
  uploader?: UploadProvider;
  model?: string;
}) {
  const examFile = await readExamFile(params.examPath);
  const exam = getPrimaryExamSection(examFile);
  const questions = exam.questions ?? [];
  const finalOutputDir = resolveOutputDir({
    defaultRoot: path.resolve(__dirname, "..", "..", "generated", "speaking-images"),
    examTitle: exam.title,
    examPath: params.examPath,
    outputDir: params.outputDir,
  });
  await ensureOutputDir(finalOutputDir);

  const manifest: ImageManifestEntry[] = [];
  const manifestPath = path.join(finalOutputDir, "manifest.json");

  for (const [index, question] of questions.entries()) {
    const baseEntry: Omit<
      ImageManifestEntry,
      "outputFile" | "uploadedUrl" | "uploadedKey" | "status" | "error"
    > = {
      index: index + 1,
      title: question.title,
      questionType: question.questionType,
      originalAssetUrl: null,
      promptLength: 0,
      aspectRatio: null,
    };

    if (!isDescribeImageQuestion(question)) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        uploadedUrl: null,
        uploadedKey: null,
        status: "skipped",
        error: "Question type does not require generated images.",
      });
      await persistManifest();
      continue;
    }

    const ensuredAsset = ensureDescribeImageAsset(question);
    const prompt = buildImagePrompt(ensuredAsset.asset);
    const aspectRatio = inferAspectRatio(ensuredAsset.asset);
    baseEntry.originalAssetUrl = ensuredAsset.asset.url ?? null;
    baseEntry.promptLength = prompt.length;
    baseEntry.aspectRatio = aspectRatio;

    if (ensuredAsset.changed) {
      await writeExamFile(params.examPath, examFile);
    }

    if (!resolveImageInstruction(ensuredAsset.asset)) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        uploadedUrl: null,
        uploadedKey: null,
        status: "skipped",
        error: "Missing imageInstruction and altText on image asset.",
      });
      await persistManifest();
      continue;
    }

    try {
      const image = await params.imageProvider.generateImage({
        prompt,
        aspectRatio,
        model: params.model,
      });
      const fileName = `${String(index + 1).padStart(2, "0")}-${question.questionType}-${slugify(question.title)}.${image.extension}`;
      const outputPath = path.join(finalOutputDir, fileName);
      await writeBinaryFile(outputPath, image.content);

      let uploadedUrl: string | null = null;
      let uploadedKey: string | null = null;
      if (params.uploader) {
        const upload = await params.uploader.uploadBuffer({
          fileName,
          content: image.content,
          mimeType: image.mimeType,
        });
        uploadedUrl = upload.url;
        uploadedKey = upload.key;
        ensuredAsset.asset.url = upload.url;
        await writeExamFile(params.examPath, examFile);
      }

      manifest.push({
        ...baseEntry,
        outputFile: outputPath,
        uploadedUrl,
        uploadedKey,
        status: "generated",
        error: null,
      });
      await persistManifest();
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
      await persistManifest();
    }
  }

  return {
    outputDir: finalOutputDir,
    manifestPath,
    manifest,
  };

  async function persistManifest() {
    await writeManifestFile(manifestPath, {
      examTitle: exam.title ?? null,
      examPath: params.examPath,
      generatedAt: new Date().toISOString(),
      items: manifest,
    });
  }
}
