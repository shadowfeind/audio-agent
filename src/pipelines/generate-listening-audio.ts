import path from "path";
import { getAudioAsset } from "../domain/assets";
import {
  LISTENING_MODEL,
  createListeningRng,
  createListeningSpeechPlan,
  isListeningQuestionType,
} from "../domain/listening";
import type { AudioManifestEntry } from "../domain/types";
import { slugify } from "../core/helpers";
import { readExamFile, writeExamFile, getPrimaryExamSection } from "../core/exam-repository";
import { writeManifestFile } from "../core/manifest-repository";
import { ensureOutputDir, resolveOutputDir, writeBinaryFile } from "../core/output";
import type { GeminiAudioProvider } from "../providers/gemini-audio";
import type { UploadProvider } from "../providers/uploadthing";

export async function generateListeningAudioPipeline(params: {
  examPath: string;
  outputDir: string;
  seedText: string;
  audioProvider: GeminiAudioProvider;
  uploader?: UploadProvider;
}) {
  const examFile = await readExamFile(params.examPath);
  const exam = getPrimaryExamSection(examFile);
  const questions = exam.questions ?? [];
  const finalOutputDir = resolveOutputDir({
    defaultRoot: path.resolve(__dirname, "..", "..", "generated", "listening"),
    examTitle: exam.title,
    examPath: params.examPath,
    outputDir: params.outputDir,
  });
  await ensureOutputDir(finalOutputDir);

  const manifest: AudioManifestEntry[] = [];
  const manifestPath = path.join(finalOutputDir, "manifest.json");
  const rng = createListeningRng(params.seedText);

  for (const [index, question] of questions.entries()) {
    const audioAsset = getAudioAsset(question);
    const transcript = audioAsset?.transcript?.trim();
    const baseEntry: Omit<
      AudioManifestEntry,
      "outputFile" | "uploadedUrl" | "uploadedKey" | "status" | "error"
    > = {
      index: index + 1,
      title: question.title,
      questionType: question.questionType,
      originalAssetUrl: audioAsset?.url ?? null,
      transcriptLength: transcript?.length ?? 0,
      speakerMode: "single",
      speakerAssignments: null,
      voiceName: null,
      accent: null,
    };

    if (!isListeningQuestionType(question.questionType)) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        uploadedUrl: null,
        uploadedKey: null,
        status: "failed",
        error: `Unsupported question type: ${question.questionType}`,
      });
      await persistManifest();
      continue;
    }

    if (!transcript) {
      manifest.push({
        ...baseEntry,
        outputFile: null,
        uploadedUrl: null,
        uploadedKey: null,
        status: "skipped",
        error: "Missing transcript on audio asset.",
      });
      await persistManifest();
      continue;
    }

    try {
      const plan = createListeningSpeechPlan(
        question.questionType,
        transcript,
        params.seedText,
        rng,
      );
      const audio =
        plan.mode === "single"
          ? await params.audioProvider.synthesizeSingleSpeakerAudio(
              transcript,
              plan,
              LISTENING_MODEL,
            )
          : await params.audioProvider.synthesizeMultiSpeakerAudio(
              transcript,
              plan,
              LISTENING_MODEL,
            );

      const fileName = `${String(index + 1).padStart(2, "0")}-${question.questionType}-${slugify(question.title)}.${audio.extension}`;
      const outputPath = path.join(finalOutputDir, fileName);
      await writeBinaryFile(outputPath, audio.content);

      let uploadedUrl: string | null = null;
      let uploadedKey: string | null = null;
      if (params.uploader) {
        const upload = await params.uploader.uploadBuffer({
          fileName,
          content: audio.content,
          mimeType: audio.mimeType,
        });
        uploadedUrl = upload.url;
        uploadedKey = upload.key;
        if (audioAsset) {
          audioAsset.url = upload.url;
          await writeExamFile(params.examPath, examFile);
        }
      }

      manifest.push({
        ...baseEntry,
        speakerMode: plan.mode,
        speakerAssignments:
          plan.mode === "multi" ? plan.speakerAssignments : null,
        voiceName: plan.mode === "single" ? plan.profile.voiceName : null,
        accent: plan.mode === "single" ? plan.profile.accentCode : plan.accentCode,
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
      seed: params.seedText,
      generatedAt: new Date().toISOString(),
      items: manifest,
    });
  }
}
