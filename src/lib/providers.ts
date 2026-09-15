import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDeepgramAsr, type AsrProvider } from "./asr";
import { createAnthropicExtractor, type Extractor } from "./extract";
import type { PipelineDeps } from "./pipeline";
import { LlmOutputSchema, TranscriptSchema } from "./types";

let override: PipelineDeps | null = null;

/** Integration tests replace both providers here; nothing else may call this. */
export function setProviders(deps: PipelineDeps | null): void {
  override = deps;
}

export function getProviders(filename?: string): PipelineDeps {
  if (override) return override;
  if (process.env.STUB_PROVIDERS === "1") return fixtureProviders(filename ?? "");
  return { asr: createDeepgramAsr(), extractor: createAnthropicExtractor() };
}

/** `meeting-a.mp3` and `meeting-a.stub.mp3` both identify the fixture `meeting-a`. */
export function fixtureIdFromFilename(filename: string): string {
  return filename.replace(/(\.stub)?\.[a-z0-9]+$/i, "");
}

/**
 * Offline browser layer only (ADR-0017). Enabled by STUB_PROVIDERS=1, which is
 * set by `npm run test:e2e:offline` and by nothing else; the deployed demo and
 * `npm run dev` always call the live providers.
 */
function fixtureProviders(filename: string): PipelineDeps {
  const id = fixtureIdFromFilename(filename);
  const read = (suffix: string) =>
    JSON.parse(readFileSync(join(process.cwd(), "fixtures", `${id}.${suffix}`), "utf8"));

  // Prefer the recorded provider transcript so the stubbed browser layer works
  // on the same data the live one does; fall back to the deterministic one.
  const transcript = TranscriptSchema.parse(
    existsSync(join(process.cwd(), "fixtures", `${id}.asr.json`))
      ? read("asr.json")
      : read("synth.asr.json"),
  );
  const output = LlmOutputSchema.parse(read("llm.json"));

  const asr: AsrProvider = {
    name: "stub-asr",
    async transcribe() {
      return { transcript, ms: 1, raw: {} };
    },
  };
  const extractor: Extractor = {
    model: "stub-extractor",
    async extract() {
      return { output, ms: 1, tokens: { input: 0, output: 0, retries: 0 } };
    },
  };
  return { asr, extractor };
}
