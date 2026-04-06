import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "fs/promises";
import {
  createDeterministicSpeakerAssignments,
  detectTwoSpeakerDialogue,
  parseSpeakerTurns,
} from "./speaker-utils";

test("parseSpeakerTurns parses repeated Speaker A / Speaker B turns", () => {
  const transcript =
    "Speaker A: Hello there. Speaker B: Hi. Speaker A: Good to see you.";
  const turns = parseSpeakerTurns(transcript);

  assert.deepEqual(turns, [
    { speaker: "Speaker A", text: "Hello there." },
    { speaker: "Speaker B", text: "Hi." },
    { speaker: "Speaker A", text: "Good to see you." },
  ]);
});

test("detectTwoSpeakerDialogue recognizes Student / Advisor dialogue", () => {
  const transcript =
    "Student: I need help with enrollment. Advisor: Please email the professor.";
  const dialogue = detectTwoSpeakerDialogue(transcript);

  assert.deepEqual(dialogue?.speakers, ["Student", "Advisor"]);
});

test("detectTwoSpeakerDialogue rejects unlabeled transcripts", () => {
  assert.equal(
    detectTwoSpeakerDialogue(
      "This is a lecture transcript without explicit speaker labels.",
    ),
    null,
  );
});

test("detectTwoSpeakerDialogue rejects malformed labels", () => {
  assert.equal(
    detectTwoSpeakerDialogue("speaker A: lowercase labels should not qualify."),
    null,
  );
});

test("detectTwoSpeakerDialogue rejects transcripts with more than two speakers", () => {
  const transcript =
    "Speaker A: Hello. Speaker B: Hi. Speaker C: Good afternoon.";
  assert.equal(detectTwoSpeakerDialogue(transcript), null);
});

test("createDeterministicSpeakerAssignments is stable and distinct", () => {
  const speakers = ["Speaker A", "Speaker B"];
  const transcript = "Speaker A: Hello. Speaker B: Hi.";
  const first = createDeterministicSpeakerAssignments(
    speakers,
    ["Kore", "Fenrir", "Enceladus"],
    "exam1-v1",
    transcript,
  );
  const second = createDeterministicSpeakerAssignments(
    speakers,
    ["Kore", "Fenrir", "Enceladus"],
    "exam1-v1",
    transcript,
  );

  assert.deepEqual(first, second);
  assert.notEqual(first[0]?.voiceName, first[1]?.voiceName);
});

test("exam1 and exam2 dialogue transcripts qualify for two-speaker mode", async () => {
  const exam1 = JSON.parse(
    await readFile(
      "/Users/travestroy/Documents/react/goal-grid/questions/pte/listening/exam1.json",
      "utf8",
    ),
  ) as Array<{ questions?: Array<{ title: string; assets?: Array<{ transcript?: string }> }> }>;
  const exam2 = JSON.parse(
    await readFile(
      "/Users/travestroy/Documents/react/goal-grid/questions/pte/listening/exam2.json",
      "utf8",
    ),
  ) as Array<{ questions?: Array<{ title: string; assets?: Array<{ transcript?: string }> }> }>;

  const exam1Questions = exam1[0]?.questions ?? [];
  const exam2Questions = exam2[0]?.questions ?? [];

  const remoteWork = exam1Questions.find(
    (question) => question.title === "The Impact of Remote Work",
  )?.assets?.[0]?.transcript;
  const exchangeProgram = exam1Questions.find(
    (question) => question.title === "Benefits of Studying Abroad",
  )?.assets?.[0]?.transcript;
  const courseRegistration = exam1Questions.find(
    (question) => question.title === "Course Registration",
  )?.assets?.[0]?.transcript;
  const urbanBeekeeping = exam2Questions.find(
    (question) => question.title === "Challenges in Urban Beekeeping",
  )?.assets?.[0]?.transcript;
  const lecture = exam1Questions.find(
    (question) => question.title === "Plate Tectonics",
  )?.assets?.[0]?.transcript;

  assert.deepEqual(detectTwoSpeakerDialogue(remoteWork ?? "")?.speakers, [
    "Speaker A",
    "Speaker B",
  ]);
  assert.deepEqual(detectTwoSpeakerDialogue(exchangeProgram ?? "")?.speakers, [
    "Speaker A",
    "Speaker B",
  ]);
  assert.deepEqual(
    detectTwoSpeakerDialogue(courseRegistration ?? "")?.speakers,
    ["Student", "Advisor"],
  );
  assert.deepEqual(detectTwoSpeakerDialogue(urbanBeekeeping ?? "")?.speakers, [
    "Speaker A",
    "Speaker B",
  ]);
  assert.equal(detectTwoSpeakerDialogue(lecture ?? ""), null);
});
