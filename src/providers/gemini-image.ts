import mime from "mime";
import { GoogleGenAI } from "@google/genai";

export type GeneratedImage = {
  mimeType: string;
  extension: string;
  content: Buffer;
};

export type GeminiImageProvider = {
  generateImage: (params: {
    prompt: string;
    aspectRatio: string;
    model?: string;
  }) => Promise<GeneratedImage>;
};

export function createGeminiImageProvider(apiKey: string): GeminiImageProvider {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generateImage({ prompt, aspectRatio, model = "gemini-3.1-flash-image-preview" }) {
      const response = await ai.models.generateContent({
        model,
        config: {
          temperature: 0.4,
          topP: 0.8,
          maxOutputTokens: 32768,
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio,
            imageSize: "1K",
          },
        },
        contents: prompt,
      });

      const inlineData =
        response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)
          ?.inlineData;
      const imageBytes = inlineData?.data || response.data;
      const mimeType = inlineData?.mimeType || "image/png";

      if (!imageBytes) {
        throw new Error("No image payload was returned by the image generation API.");
      }

      return {
        mimeType,
        extension: mime.getExtension(mimeType) || "png",
        content: Buffer.from(imageBytes, "base64"),
      };
    },
  };
}
