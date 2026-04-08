import test from "node:test";
import assert from "node:assert/strict";
import {
  collectStreamedAudio,
  convertToWav,
  createWavHeader,
  mergeWavAudioSegments,
  parseMimeType,
} from "./audio-utils";

test("parseMimeType falls back to safe PCM defaults", () => {
  assert.deepEqual(parseMimeType("audio/L16"), {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16,
  });
});

test("convertToWav uses decoded byte length in the WAV header", () => {
  const pcm = Buffer.from([1, 2, 3, 4]);
  const wav = convertToWav(pcm.toString("base64"), "audio/L16;rate=16000");

  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.deepEqual(wav.subarray(44), pcm);
});

test("collectStreamedAudio concatenates streamed base64 payloads", async () => {
  async function* stream() {
    yield {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/mpeg",
                  data: Buffer.from("hello ").toString("base64"),
                },
              },
            ],
          },
        },
      ],
    };

    yield {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/mpeg",
                  data: Buffer.from("world").toString("base64"),
                },
              },
            ],
          },
        },
      ],
    };
  }

  const result = await collectStreamedAudio(stream());

  assert.equal(result.extension, "mpga");
  assert.equal(result.content.toString("utf8"), "hello world");
});

test("collectStreamedAudio converts raw PCM streams to wav", async () => {
  const pcm = Buffer.from([9, 8, 7, 6]);

  async function* stream() {
    yield {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/L16;rate=22050",
                  data: pcm.toString("base64"),
                },
              },
            ],
          },
        },
      ],
    };
  }

  const result = await collectStreamedAudio(stream());

  assert.equal(result.extension, "wav");
  assert.equal(result.content.readUInt32LE(40), pcm.length);
  assert.deepEqual(result.content.subarray(44), pcm);
});

test("mergeWavAudioSegments concatenates PCM and inserts silence", () => {
  const options = {
    numChannels: 1,
    sampleRate: 1000,
    bitsPerSample: 16,
  } as const;
  const firstPcm = Buffer.from([1, 0, 2, 0]);
  const secondPcm = Buffer.from([3, 0]);
  const firstWav = Buffer.concat([
    createWavHeader(firstPcm.length, options),
    firstPcm,
  ]);
  const secondWav = Buffer.concat([
    createWavHeader(secondPcm.length, options),
    secondPcm,
  ]);

  const merged = mergeWavAudioSegments([
    { content: firstWav, silenceAfterMs: 2 },
    { content: secondWav },
  ]);

  assert.equal(merged.extension, "wav");
  assert.equal(merged.mimeType, "audio/wav");
  assert.deepEqual(merged.content.subarray(44), Buffer.from([1, 0, 2, 0, 0, 0, 0, 0, 3, 0]));
});
