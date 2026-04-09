import type { ExamQuestion, ImageAsset } from "./types";
import { ensureImageAsset as ensureImageAssetRecord } from "./assets";

export function ensureDescribeImageAsset(question: ExamQuestion) {
  return ensureImageAssetRecord(question);
}

export function resolveImageInstruction(asset: ImageAsset) {
  return asset.metadata?.imageInstruction?.trim() || asset.altText?.trim() || "";
}

export function inferAspectRatio(asset: ImageAsset) {
  const instruction = resolveImageInstruction(asset).toLowerCase();
  const altText = asset.altText?.toLowerCase() ?? "";
  const combined = `${instruction} ${altText}`;

  if (
    combined.includes("map") ||
    combined.includes("line graph") ||
    combined.includes("bar chart") ||
    combined.includes("landscape layout")
  ) {
    return "4:3";
  }

  if (combined.includes("pie chart")) {
    return "1:1";
  }

  return "4:3";
}

export function buildImagePrompt(asset: ImageAsset) {
  const instruction = resolveImageInstruction(asset);

  if (!instruction) {
    return "";
  }

  const promptParts = [
    instruction,
    "Produce exactly one clean exam-style educational image.",
    "Use correct English spelling in all visible text.",
    "Do not misspell any labels, titles, legends, axis text, or annotations.",
    "If text appears in the image, it must exactly match the requested wording.",
    "Keep the background light and the composition uncluttered.",
    "Use standard exam-prep quality and normal detail, not premium or highly detailed rendering.",
    "Avoid watermarks, logos, decorative frames, and irrelevant extra elements.",
  ];

  if (asset.altText?.trim()) {
    promptParts.push(`Target description: ${asset.altText.trim()}`);
  }

  return promptParts.join(" ");
}
