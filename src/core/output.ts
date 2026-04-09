import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { slugify } from "./helpers";

export function resolveOutputDir(params: {
  defaultRoot: string;
  examTitle?: string | null;
  examPath: string;
  outputDir?: string;
}) {
  const examSlug = slugify(
    params.examTitle || path.basename(params.examPath, path.extname(params.examPath)),
  );
  return params.outputDir || path.join(params.defaultRoot, examSlug);
}

export async function ensureOutputDir(outputDir: string) {
  await mkdir(outputDir, { recursive: true });
}

export async function writeBinaryFile(filePath: string, content: Buffer) {
  await writeFile(filePath, content);
}
