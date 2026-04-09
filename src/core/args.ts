import path from "path";

type ParseGenerationArgsOptions = {
  usage: string;
  allowSeed?: boolean;
};

export type GenerationArgs = {
  examPath: string;
  outputDir: string;
  seedText: string;
};

export type UploadSyncArgs = {
  examPath: string;
  manifestPath: string;
  expectedCount?: number;
};

export function parseGenerationArgs(
  argv: string[],
  options: ParseGenerationArgsOptions,
): GenerationArgs {
  let examPath = "";
  let outputDir = "";
  let seedText = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--output" || arg === "-o") {
      outputDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (options.allowSeed && arg === "--seed") {
      seedText = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (!examPath) {
      examPath = arg;
    }
  }

  if (!examPath) {
    throw new Error(options.usage);
  }

  const resolvedExamPath = path.resolve(examPath);

  return {
    examPath: resolvedExamPath,
    outputDir: outputDir ? path.resolve(outputDir) : "",
    seedText:
      options.allowSeed && seedText
        ? seedText
        : `${resolvedExamPath}:${Date.now()}`,
  };
}

export function parseUploadSyncArgs(argv: string[], usage: string): UploadSyncArgs {
  let examPath = "";
  let manifestPath = "";
  let expectedCount: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--expected-count") {
      const rawValue = argv[index + 1] ?? "";
      const parsedValue = Number.parseInt(rawValue, 10);
      if (Number.isNaN(parsedValue)) {
        throw new Error(`Invalid --expected-count value: ${rawValue}`);
      }
      expectedCount = parsedValue;
      index += 1;
      continue;
    }

    if (!examPath) {
      examPath = arg;
      continue;
    }

    if (!manifestPath) {
      manifestPath = arg;
    }
  }

  if (!examPath || !manifestPath) {
    throw new Error(usage);
  }

  return {
    examPath: path.resolve(examPath),
    manifestPath: path.resolve(manifestPath),
    expectedCount,
  };
}
