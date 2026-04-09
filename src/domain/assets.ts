import type {
  AudioAsset,
  ExamQuestion,
  ImageAsset,
  QuestionAsset,
  SpeakingQuestionType,
} from "./types";

function getAssetIndexByKind(question: ExamQuestion, kind: string) {
  const preferredIndex =
    question.assets?.findIndex((asset) => asset.kind === kind) ?? -1;

  if (preferredIndex >= 0) {
    return preferredIndex;
  }

  return question.assets?.length ? 0 : -1;
}

export function getAudioAssetIndex(question: ExamQuestion) {
  return getAssetIndexByKind(question, "audio");
}

export function getImageAssetIndex(question: ExamQuestion) {
  return getAssetIndexByKind(question, "image");
}

export function getAudioAsset(question: ExamQuestion): AudioAsset | null {
  const assetIndex = getAudioAssetIndex(question);
  if (assetIndex < 0) {
    return null;
  }
  return (question.assets?.[assetIndex] as AudioAsset | undefined) ?? null;
}

export function getImageAsset(question: ExamQuestion): ImageAsset | null {
  const assetIndex = getImageAssetIndex(question);
  if (assetIndex < 0) {
    return null;
  }
  return (question.assets?.[assetIndex] as ImageAsset | undefined) ?? null;
}

function appendAsset(question: ExamQuestion, asset: QuestionAsset) {
  question.assets = [...(question.assets ?? []), asset];
  return question.assets.length - 1;
}

export function ensureAudioAsset(
  question: ExamQuestion,
  label: string,
  transcript?: string,
) {
  const existingIndex = getAudioAssetIndex(question);

  if (existingIndex >= 0) {
    const asset = question.assets?.[existingIndex] as AudioAsset | undefined;
    if (!asset) {
      throw new Error("Resolved audio asset index points to no asset.");
    }

    let changed = false;
    if (transcript && !asset.transcript?.trim()) {
      asset.transcript = transcript;
      changed = true;
    }

    if (!asset.label) {
      asset.label = label;
      changed = true;
    }

    return {
      asset,
      index: existingIndex,
      changed,
    };
  }

  const asset: AudioAsset = {
    kind: "audio",
    label,
    transcript: transcript ?? null,
  };

  return {
    asset,
    index: appendAsset(question, asset),
    changed: true,
  };
}

export function ensureImageAsset(question: ExamQuestion) {
  const existingIndex = getImageAssetIndex(question);

  if (existingIndex >= 0) {
    const asset = question.assets?.[existingIndex] as ImageAsset | undefined;
    if (!asset) {
      throw new Error("Resolved image asset index points to no asset.");
    }

    if (!asset.label) {
      asset.label = "Prompt image";
      return { asset, index: existingIndex, changed: true };
    }

    return {
      asset,
      index: existingIndex,
      changed: false,
    };
  }

  const asset: ImageAsset = {
    kind: "image",
    label: "Prompt image",
  };

  return {
    asset,
    index: appendAsset(question, asset),
    changed: true,
  };
}

export function getSpeakingAudioAssetLabel(questionType: SpeakingQuestionType) {
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
    default:
      return "Question audio";
  }
}
