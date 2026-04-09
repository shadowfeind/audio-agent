import test from "node:test";
import assert from "node:assert/strict";
import { runListeningCli } from "./generate-listening";
import { runSpeakingCli } from "./generate-speaking";
import { runImagesCli } from "./generate-images";
import { runSyncManifestCli } from "./sync-manifest";

async function withEnvRemoved(names: string[], fn: () => Promise<void>) {
  const previous = new Map(names.map((name) => [name, process.env[name]]));

  for (const name of names) {
    delete process.env[name];
  }

  try {
    await fn();
  } finally {
    for (const [name, value] of previous.entries()) {
      if (typeof value === "string") {
        process.env[name] = value;
      } else {
        delete process.env[name];
      }
    }
  }
}

test("runListeningCli validates GEMINI_API_KEY before executing", async () => {
  await withEnvRemoved(["GEMINI_API_KEY"], async () => {
    await assert.rejects(
      () => runListeningCli(["/tmp/example.json"]),
      /Missing GEMINI_API_KEY in the environment\./,
    );
  });
});

test("runSpeakingCli validates GEMINI_API_KEY before executing", async () => {
  await withEnvRemoved(["GEMINI_API_KEY"], async () => {
    await assert.rejects(
      () => runSpeakingCli(["/tmp/example.json"]),
      /Missing GEMINI_API_KEY in the environment\./,
    );
  });
});

test("runImagesCli validates GEMINI_API_KEY before executing", async () => {
  await withEnvRemoved(["GEMINI_API_KEY"], async () => {
    await assert.rejects(
      () => runImagesCli(["/tmp/example.json"]),
      /Missing GEMINI_API_KEY in the environment\./,
    );
  });
});

test("runSyncManifestCli validates UPLOADTHING_TOKEN before executing", async () => {
  await withEnvRemoved(["UPLOADTHING_TOKEN"], async () => {
    await assert.rejects(
      () => runSyncManifestCli(["/tmp/example.json", "/tmp/manifest.json"]),
      /Missing UPLOADTHING_TOKEN in the environment\./,
    );
  });
});
