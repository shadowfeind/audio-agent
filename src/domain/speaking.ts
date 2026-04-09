import {
  createDeterministicSpeakerAssignmentsForAnyCount,
  hashString,
  parseSpeakerTurns,
} from "../audio/speaker-utils";
import { createRng, pickOne } from "../core/helpers";
import { ensureAudioAsset, getAudioAsset, getSpeakingAudioAssetLabel } from "./assets";
import {
  ACCENT_LABELS,
  ALL_ACCENTS,
  DIALOGUE_VOICES,
  type QuestionVoiceRule,
  type SpeechPlan,
  type VoiceProfile,
} from "./speech-types";
import type {
  AccentCode,
  ExamQuestion,
  SpeakingQuestionType,
} from "./types";

export type SpeakingAudioQuestionType =
  | "repeat_sentence"
  | "retell_lecture"
  | "answer_short_question"
  | "summarize_group_discussion"
  | "respond_to_a_situation";

export const SPEAKING_MODEL = "gemini-2.5-pro-preview-tts";

const AUDIO_QUESTION_TYPES = new Set<SpeakingAudioQuestionType>([
  "repeat_sentence",
  "retell_lecture",
  "answer_short_question",
  "summarize_group_discussion",
  "respond_to_a_situation",
]);

export const SPEAKING_VOICE_RULES: Record<
  SpeakingAudioQuestionType,
  QuestionVoiceRule
> = {
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

export function isSpeakingAudioQuestionType(
  questionType: string,
): questionType is SpeakingAudioQuestionType {
  return AUDIO_QUESTION_TYPES.has(questionType as SpeakingAudioQuestionType);
}

export function resolveSpeakingTranscript(question: ExamQuestion) {
  const assetTranscript = getAudioAsset(question)?.transcript?.trim();
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

export function ensureSpeakingAudioQuestionAsset(
  question: ExamQuestion,
  transcript: string,
) {
  if (!isSpeakingAudioQuestionType(question.questionType)) {
    throw new Error(
      `Cannot create an audio asset for non-audio question type: ${question.questionType}`,
    );
  }

  return ensureAudioAsset(
    question,
    getSpeakingAudioAssetLabel(question.questionType),
    transcript,
  );
}

function createVoiceProfile(
  questionType: SpeakingAudioQuestionType,
  rng: () => number,
): VoiceProfile {
  const rule = SPEAKING_VOICE_RULES[questionType];
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

export function createSpeakingSpeechPlan(
  questionType: SpeakingAudioQuestionType,
  transcript: string,
  seedText: string,
  rng: () => number,
): SpeechPlan {
  const rule = SPEAKING_VOICE_RULES[questionType];
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
  const accentCode = rule.accents[accentSeed % rule.accents.length] as AccentCode;

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

export function createSpeakingRng(seedText: string) {
  return createRng(hashString(seedText));
}

export function isSpeakingQuestionType(
  questionType: string,
): questionType is SpeakingQuestionType {
  return (
    questionType === "read_aloud" ||
    questionType === "repeat_sentence" ||
    questionType === "describe_image" ||
    questionType === "retell_lecture" ||
    questionType === "answer_short_question" ||
    questionType === "summarize_group_discussion" ||
    questionType === "respond_to_a_situation"
  );
}
