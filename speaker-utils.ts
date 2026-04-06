export type VoiceName =
  | "Aoede"
  | "Puck"
  | "Kore"
  | "Fenrir"
  | "Enceladus"
  | "Achernar"
  | "Algenib";

export type SpeakerTurn = {
  speaker: string;
  text: string;
};

export type SpeakerAssignment = {
  speaker: string;
  voiceName: VoiceName;
};

const TURN_LABEL_PATTERN =
  /(?:^|(?<=[.!?])\s+)(?<speaker>[A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*):\s*/g;

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseSpeakerTurns(transcript: string): SpeakerTurn[] {
  const matches = [...transcript.matchAll(TURN_LABEL_PATTERN)];
  if (matches.length === 0) {
    return [];
  }

  const turns: SpeakerTurn[] = [];

  for (const [index, match] of matches.entries()) {
    const speaker = match.groups?.speaker?.trim();
    const contentStart = (match.index ?? 0) + match[0].length;
    const nextMatchIndex = matches[index + 1]?.index ?? transcript.length;
    const text = transcript.slice(contentStart, nextMatchIndex).trim();

    if (!speaker || !text) {
      return [];
    }

    turns.push({ speaker, text });
  }

  return turns;
}

export function detectTwoSpeakerDialogue(transcript: string) {
  const turns = parseSpeakerTurns(transcript);
  if (turns.length < 2) {
    return null;
  }

  const speakers: string[] = [];

  for (const turn of turns) {
    if (!speakers.includes(turn.speaker)) {
      speakers.push(turn.speaker);
    }
  }

  if (speakers.length !== 2) {
    return null;
  }

  return {
    turns,
    speakers,
  };
}

export function createDeterministicSpeakerAssignments(
  speakers: string[],
  availableVoices: VoiceName[],
  seedText: string,
  transcript: string,
): SpeakerAssignment[] {
  if (speakers.length !== 2) {
    throw new Error(
      `Expected exactly 2 speakers for multi-speaker assignment, received ${speakers.length}.`,
    );
  }

  if (availableVoices.length < 2) {
    throw new Error("At least 2 dialogue voices are required.");
  }

  const rng = createRng(hashString(`${seedText}:${transcript}`));
  const voicePool = [...availableVoices];
  const assignments: SpeakerAssignment[] = [];

  for (const speaker of speakers) {
    const index = Math.floor(rng() * voicePool.length);
    const [voiceName] = voicePool.splice(index, 1);
    assignments.push({
      speaker,
      voiceName: voiceName!,
    });
  }

  return assignments;
}
