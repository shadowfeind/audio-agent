import { readFile, writeFile } from "fs/promises";
import type { ExamFile, ExamQuestion, ExamSection } from "../domain/types";

export async function readExamFile(examPath: string): Promise<ExamFile> {
  const raw = await readFile(examPath, "utf8");
  return JSON.parse(raw) as ExamFile;
}

export async function writeExamFile(examPath: string, examFile: ExamFile) {
  await writeFile(examPath, `${JSON.stringify(examFile, null, 2)}\n`, "utf8");
}

export function getPrimaryExamSection(examFile: ExamFile): ExamSection {
  const exam = examFile[0];
  if (!exam?.questions?.length) {
    throw new Error(
      "The exam JSON does not contain any questions in data[0].questions.",
    );
  }
  return exam;
}

export function getExamQuestions(examFile: ExamFile): ExamQuestion[] {
  return getPrimaryExamSection(examFile).questions ?? [];
}
