import mime from "mime";

export interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export type AudioChunk = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
      }>;
    };
  }>;
};

export function parseMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(";").map((segment) => segment.trim());
  const [, format] = fileType.split("/");

  const options: { numChannels: number; sampleRate?: number; bitsPerSample?: number } = {
    numChannels: 1,
  };

  if (format?.startsWith("L")) {
    const bits = Number.parseInt(format.slice(1), 10);
    if (!Number.isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split("=").map((segment) => segment.trim());
    if (key === "rate") {
      const sampleRate = Number.parseInt(value, 10);
      if (!Number.isNaN(sampleRate)) {
        options.sampleRate = sampleRate;
      }
    }
  }

  return {
    numChannels: options.numChannels,
    sampleRate: options.sampleRate ?? 24000,
    bitsPerSample: options.bitsPerSample ?? 16,
  };
}

export function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

export function convertToWav(rawData: string, mimeType: string) {
  const options = parseMimeType(mimeType);
  const audioBuffer = Buffer.from(rawData, "base64");
  const header = createWavHeader(audioBuffer.length, options);
  return Buffer.concat([header, audioBuffer]);
}

export function extractAudioPart(chunk: AudioChunk) {
  return chunk.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
}

export async function collectStreamedAudio(
  response: AsyncIterable<AudioChunk>,
) {
  const base64Chunks: string[] = [];
  let mimeType = "";

  for await (const chunk of response) {
    const inlineData = extractAudioPart(chunk);
    if (!inlineData?.data) {
      continue;
    }

    base64Chunks.push(inlineData.data);
    if (!mimeType && inlineData.mimeType) {
      mimeType = inlineData.mimeType;
    }
  }

  if (base64Chunks.length === 0) {
    throw new Error("No audio payload was returned by the TTS stream.");
  }

  const resolvedMimeType = mimeType || "audio/L16;rate=24000";
  const knownExtension = mime.getExtension(resolvedMimeType);

  if (!knownExtension) {
    return {
      extension: "wav",
      content: convertToWav(base64Chunks.join(""), resolvedMimeType),
      mimeType: "audio/wav",
    };
  }

  return {
    extension: knownExtension,
    content: Buffer.from(base64Chunks.join(""), "base64"),
    mimeType: resolvedMimeType,
  };
}
