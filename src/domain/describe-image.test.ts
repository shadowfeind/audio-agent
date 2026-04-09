import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImagePrompt,
  inferAspectRatio,
  resolveImageInstruction,
} from "./describe-image";
import { ensureImageAsset, getImageAssetIndex } from "./assets";
import type { ExamQuestion as DescribeImageQuestion } from "./types";

test("getImageAssetIndex prefers image assets", () => {
  const question: DescribeImageQuestion = {
    title: "Chart",
    questionType: "describe_image",
    assets: [
      { kind: "audio", url: "https://example.com/audio.mp3" },
      { kind: "image", url: "https://example.com/image.png" },
    ],
  };

  assert.equal(getImageAssetIndex(question), 1);
});

test("ensureImageAsset creates an image asset when missing", () => {
  const question: DescribeImageQuestion = {
    title: "Chart",
    questionType: "describe_image",
    assets: [],
  };

  const result = ensureImageAsset(question);

  assert.equal(result.changed, true);
  assert.equal(result.index, 0);
  assert.equal(question.assets?.[0]?.kind, "image");
  assert.equal(question.assets?.[0]?.label, "Prompt image");
});

test("resolveImageInstruction prefers metadata over alt text", () => {
  assert.equal(
    resolveImageInstruction({
      altText: "fallback alt text",
      metadata: { imageInstruction: "explicit instruction" },
    }),
    "explicit instruction",
  );
});

test("inferAspectRatio uses square for pie charts", () => {
  assert.equal(
    inferAspectRatio({
      altText: "A pie chart of renewable energy sources.",
    }),
    "1:1",
  );
});

test("buildImagePrompt includes exam rendering guidance", () => {
  const prompt = buildImagePrompt({
    altText: "A line graph comparing device usage.",
    metadata: {
      imageInstruction: "Create a clean academic line graph.",
    },
  });

  assert.match(prompt, /Create a clean academic line graph\./);
  assert.match(prompt, /exactly one clean exam-style educational image/i);
  assert.match(prompt, /Target description: A line graph comparing device usage\./);
});
