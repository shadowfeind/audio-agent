import type { SpeakerAssignment, VoiceName } from "../audio/speaker-utils";
import type { AccentCode } from "./types";

export type VoiceProfile = {
  voiceName: VoiceName;
  accentCode: AccentCode;
  accentLabel: string;
  speakingStyle: string;
  pacing: string;
};

export type QuestionVoiceRule = {
  voices: VoiceName[];
  accents: AccentCode[];
  speakingStyle: string;
  pacing: string;
};

export type SingleSpeakerPlan = {
  mode: "single";
  profile: VoiceProfile;
};

export type MultiSpeakerPlan = {
  mode: "multi";
  accentCode: AccentCode;
  accentLabel: string;
  speakingStyle: string;
  pacing: string;
  speakerAssignments: SpeakerAssignment[];
};

export type SpeechPlan = SingleSpeakerPlan | MultiSpeakerPlan;

export const ALL_ACCENTS: AccentCode[] = ["en-US", "en-GB", "en-AU"];

export const DIALOGUE_VOICES: VoiceName[] = [
  "Kore",
  "Fenrir",
  "Enceladus",
  "Achernar",
  "Aoede",
  "Puck",
  "Algenib",
];

export const ACCENT_LABELS: Record<AccentCode, string> = {
  "en-US": "American English",
  "en-GB": "British English",
  "en-AU": "Australian English",
};
