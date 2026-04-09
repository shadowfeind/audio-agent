import { mergeWavAudioSegments } from "../audio/audio-utils";
import { parseSpeakerTurns, type VoiceName } from "../audio/speaker-utils";
import type { MultiSpeakerPlan, SingleSpeakerPlan, SpeechPlan } from "../domain/speech-types";
import type { GeminiAudioProvider } from "../providers/gemini-audio";

function createSingleSpeakerPlanFromMultiSpeaker(
  plan: MultiSpeakerPlan,
  voiceName: VoiceName,
): SingleSpeakerPlan {
  return {
    mode: "single",
    profile: {
      voiceName,
      accentCode: plan.accentCode,
      accentLabel: plan.accentLabel,
      speakingStyle: plan.speakingStyle,
      pacing: plan.pacing,
    },
  };
}

export async function synthesizeSpeakingAudioWithStrategy(params: {
  audioProvider: GeminiAudioProvider;
  transcript: string;
  plan: SpeechPlan;
  model: string;
}) {
  const { audioProvider, transcript, plan, model } = params;

  if (plan.mode === "single") {
    return audioProvider.synthesizeSingleSpeakerAudio(transcript, plan, model);
  }

  if (plan.speakerAssignments.length <= 2) {
    return audioProvider.synthesizeMultiSpeakerAudio(transcript, plan, model);
  }

  const turns = parseSpeakerTurns(transcript);
  if (turns.length === 0) {
    throw new Error(
      "Segmented dialogue synthesis requires labeled speaker turns in the transcript.",
    );
  }

  const voiceBySpeaker = new Map(
    plan.speakerAssignments.map(({ speaker, voiceName }) => [speaker, voiceName]),
  );
  const segments: Array<{ content: Buffer; silenceAfterMs?: number }> = [];

  for (const [index, turn] of turns.entries()) {
    const voiceName = voiceBySpeaker.get(turn.speaker);
    if (!voiceName) {
      throw new Error(`Missing voice assignment for speaker "${turn.speaker}".`);
    }

    const audio = await audioProvider.synthesizeSingleSpeakerAudio(
      turn.text,
      createSingleSpeakerPlanFromMultiSpeaker(plan, voiceName),
      model,
    );

    if (audio.extension !== "wav") {
      throw new Error(
        `Segmented dialogue synthesis requires WAV output, received ${audio.extension}.`,
      );
    }

    segments.push({
      content: audio.content,
      silenceAfterMs: index < turns.length - 1 ? 180 : 0,
    });
  }

  return mergeWavAudioSegments(segments);
}
