import {
  createDeterministicSpeakerAssignments,
  detectTwoSpeakerDialogue,
  hashString,
  type VoiceName,
} from "../audio/speaker-utils";
import { createRng, pickOne } from "../core/helpers";
import {
  ACCENT_LABELS,
  ALL_ACCENTS,
  DIALOGUE_VOICES,
  type QuestionVoiceRule,
  type SpeechPlan,
  type VoiceProfile,
} from "./speech-types";
import type { AccentCode, ListeningQuestionType } from "./types";

export type ListeningGenerationContext = {
  examPath: string;
  outputDir: string;
  seedText: string;
};

export const LISTENING_MODEL = "gemini-2.5-pro-preview-tts";

export const LISTENING_VOICE_RULES: Record<ListeningQuestionType, QuestionVoiceRule> = {
  summarize_spoken_text: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear academic lecture narration",
    pacing: "moderate and natural",
  },
  multiple_choice_multiple_answers: {
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
    speakingStyle: "clear academic discussion narration",
    pacing: "natural conversational",
  },
  fill_in_the_blanks: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear lecture delivery",
    pacing: "natural with slight clarity emphasis",
  },
  highlight_correct_summary: {
    voices: ["Aoede", "Kore", "Enceladus", "Achernar", "Algenib"],
    accents: ALL_ACCENTS,
    speakingStyle: "clear lecture summary narration",
    pacing: "moderate and natural",
  },
  multiple_choice_single_answer: {
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
    speakingStyle: "clear assessment narration",
    pacing: "moderate and precise",
  },
};

export function isListeningQuestionType(
  questionType: string,
): questionType is ListeningQuestionType {
  return questionType in LISTENING_VOICE_RULES;
}

function createVoiceProfile(
  questionType: ListeningQuestionType,
  rng: () => number,
): VoiceProfile {
  const rule = LISTENING_VOICE_RULES[questionType];
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

export function createListeningSpeechPlan(
  questionType: ListeningQuestionType,
  transcript: string,
  seedText: string,
  rng: () => number,
): SpeechPlan {
  const rule = LISTENING_VOICE_RULES[questionType];
  const dialogue = detectTwoSpeakerDialogue(transcript);

  if (!dialogue) {
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
    speakerAssignments: createDeterministicSpeakerAssignments(
      dialogue.speakers,
      DIALOGUE_VOICES,
      seedText,
      transcript,
    ),
  };
}

export function createListeningRng(seedText: string) {
  return createRng(hashString(seedText));
}
