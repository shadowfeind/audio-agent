import { GoogleGenAI } from "@google/genai";
import {
  collectStreamedAudio,
  type GeneratedAudio,
} from "../audio/audio-utils";
import type {
  MultiSpeakerPlan,
  SingleSpeakerPlan,
} from "../domain/speech-types";

export type GeminiAudioProvider = {
  synthesizeSingleSpeakerAudio: (
    transcript: string,
    plan: SingleSpeakerPlan,
    model?: string,
  ) => Promise<GeneratedAudio>;
  synthesizeMultiSpeakerAudio: (
    transcript: string,
    plan: MultiSpeakerPlan,
    model?: string,
  ) => Promise<GeneratedAudio>;
};

export function createGeminiAudioProvider(apiKey: string): GeminiAudioProvider {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async synthesizeSingleSpeakerAudio(
      transcript,
      plan,
      model = "gemini-2.5-pro-preview-tts",
    ) {
      const response = await ai.models.generateContentStream({
        model,
        config: {
          temperature: 1,
          responseModalities: ["audio"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: plan.profile.voiceName,
              },
            },
          },
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  `Speak in ${plan.profile.accentLabel}.`,
                  `Use a ${plan.profile.speakingStyle} tone.`,
                  `Keep the pacing ${plan.profile.pacing}.`,
                  "Read the following transcript exactly as written.",
                  transcript,
                ].join(" "),
              },
            ],
          },
        ],
      });

      return collectStreamedAudio(response);
    },
    async synthesizeMultiSpeakerAudio(
      transcript,
      plan,
      model = "gemini-2.5-pro-preview-tts",
    ) {
      const response = await ai.models.generateContentStream({
        model,
        config: {
          temperature: 1,
          responseModalities: ["audio"],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: plan.speakerAssignments.map(
                ({ speaker, voiceName }) => ({
                  speaker,
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName,
                    },
                  },
                }),
              ),
            },
          },
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  `Perform the following dialogue in ${plan.accentLabel}.`,
                  `Use a ${plan.speakingStyle} tone and keep the pacing ${plan.pacing}.`,
                  "Use the named speakers exactly as labeled in the transcript.",
                  "Do not read the speaker labels aloud as narration.",
                  "Render each speaker with a distinct natural voice.",
                  "Read the dialogue content exactly as written.",
                  transcript,
                ].join(" "),
              },
            ],
          },
        ],
      });

      return collectStreamedAudio(response);
    },
  };
}
