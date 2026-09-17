import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AsrProvider } from "@/lib/asr";
import type { Extractor } from "@/lib/extract";
import type { ExpectedSet } from "@/lib/score";
import { LlmOutputSchema, TranscriptSchema, type LlmOutput, type Transcript } from "@/lib/types";

export const FIXTURE_IDS = ["meeting-a", "meeting-b", "meeting-c"] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

const FIXTURES = join(process.cwd(), "fixtures");

function read<T>(file: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as T;
}

export function loadTranscript(id: FixtureId): Transcript {
  try {
    return TranscriptSchema.parse(read(`${id}.asr.json`));
  } catch {
    return TranscriptSchema.parse(read(`${id}.synth.asr.json`));
  }
}

export function loadLlmOutput(id: FixtureId): LlmOutput {
  return LlmOutputSchema.parse(read(`${id}.llm.json`));
}

export function loadExpected(id: FixtureId): ExpectedSet {
  return read<ExpectedSet>(`${id}.expected.json`);
}

export function stubAsr(transcript: Transcript, ms = 1_200, language = "en"): AsrProvider {
  return {
    name: "stub-asr",
    async transcribe() {
      return { transcript, ms, raw: {}, language };
    },
  };
}

export function stubExtractor(output: LlmOutput, ms = 4_000): Extractor {
  return {
    model: "stub-extractor",
    async extract() {
      return { output, ms, tokens: { input: 3_500, output: 900, retries: 0 } };
    },
  };
}