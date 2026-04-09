import type { SpeakerAssignment, VoiceName } from "../audio/speaker-utils";

export type AccentCode = "en-US" | "en-GB" | "en-AU";

export type ListeningQuestionType =
  | "summarize_spoken_text"
  | "multiple_choice_multiple_answers"
  | "fill_in_the_blanks"
  | "highlight_correct_summary"
  | "multiple_choice_single_answer"
  | "select_missing_word"
  | "highlight_incorrect_words"
  | "write_from_dictation";

export type SpeakingQuestionType =
  | "read_aloud"
  | "repeat_sentence"
  | "describe_image"
  | "retell_lecture"
  | "answer_short_question"
  | "summarize_group_discussion"
  | "respond_to_a_situation";

export type QuestionType = ListeningQuestionType | SpeakingQuestionType;

export type QuestionPrompt = {
  passage?: string;
  question?: string;
  situation?: string;
  [key: string]: unknown;
};

export type BaseAsset = {
  kind?: string;
  url?: string;
  label?: string;
};

export type AudioAsset = BaseAsset & {
  kind?: "audio";
  transcript?: string | null;
};

export type ImageAssetMetadata = {
  imageInstruction?: string;
};

export type ImageAsset = BaseAsset & {
  kind?: "image";
  altText?: string;
  metadata?: ImageAssetMetadata;
};

export type QuestionAsset =
  | AudioAsset
  | ImageAsset
  | (BaseAsset & Record<string, unknown>);

export type ExamQuestion = {
  questionType: QuestionType;
  title: string;
  prompt?: QuestionPrompt;
  assets?: QuestionAsset[];
  settings?: Record<string, unknown>;
  answerKey?: unknown;
  instructions?: string;
  difficulty?: string;
};

export type ExamSection = {
  title?: string;
  questions?: ExamQuestion[];
  [key: string]: unknown;
};

export type ExamFile = ExamSection[];

export type ManifestStatus = "generated" | "skipped" | "failed";

export type BaseManifestEntry = {
  index: number;
  title: string;
  questionType: QuestionType;
  originalAssetUrl: string | null;
  outputFile: string | null;
  uploadedUrl: string | null;
  uploadedKey: string | null;
  status: ManifestStatus;
  error: string | null;
};

export type AudioManifestEntry = BaseManifestEntry & {
  transcriptLength: number;
  speakerMode: "single" | "multi";
  speakerAssignments: SpeakerAssignment[] | null;
  voiceName: VoiceName | null;
  accent: AccentCode | null;
};

export type ImageManifestEntry = BaseManifestEntry & {
  promptLength: number;
  aspectRatio: string | null;
};

export type UploadManifestEntry = {
  index: number;
  title: string;
  questionType: QuestionType;
  outputFile: string | null;
  status: ManifestStatus;
  error: string | null;
  uploadedUrl?: string | null;
  uploadedKey?: string | null;
};

export type ManifestFile<TEntry> = {
  examTitle?: string | null;
  examPath: string;
  seed?: string;
  generatedAt?: string;
  items: TEntry[];
};
