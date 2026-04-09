# audio-agent

Modular CLI for generating audio and image assets.

## Commands

```bash
npm run generate:listening -- <exam-json-path> [--output <dir>] [--seed <value>]
npm run generate:speaking -- <exam-json-path> [--output <dir>] [--seed <value>]
npm run generate:images -- <exam-json-path> [--output <dir>]
npm run upload:exam1 -- <exam-json-path> <manifest-path> [--expected-count <n>]
```

## Environment

- `GEMINI_API_KEY`: required for all generation commands
- `UPLOADTHING_TOKEN`: optional for generation commands, required for `upload:exam1`
- `GEMINI_IMAGE_MODEL`: optional override for image generation, defaults to `imagen-4.0-generate-001`

## Outputs

- Listening audio: `generated/listening/<exam-slug>/`
- Speaking audio: `generated/speaking/<exam-slug>/`
- Describe-image assets: `generated/speaking-images/<exam-slug>/`

Each run writes generated artifacts plus a `manifest.json` in the same output folder. The `generated/` directory is gitignored.
