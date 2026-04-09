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
    async generateImage({ prompt, aspectRatio, model = "imagen-4.0-generate-001" }) {
      const response = await ai.models.generateImages({
        model,
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio,
          outputMimeType: "image/png",
        },
      });

      const generatedImage = response.generatedImages?.[0]?.image;
      const imageBytes = generatedImage?.imageBytes;
      const mimeType = generatedImage?.mimeType || "image/png";

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
