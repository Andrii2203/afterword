/**
 * Deterministic stand-in for speech recognition.
 *
 * It turns a fixture script into a transcript with the same shape Deepgram
 * returns, so unit and integration tests can run with no network and no key.
 * It is never used in the product flow.
 *
 * Usage: npx tsx scripts/make-transcript.ts meeting-a meeting-b meeting-c
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Transcript } from "../src/lib/types";

const MS_PER_WORD = 350;
const GAP_MS = 400;
const START_MS = 500;
const FIXTURES = join(process.cwd(), "fixtures");

interface Script {
  id: string;
  speakers: { label: string; name: string }[];
  turns: { speaker: string; text: string }[];
}

export function scriptToTranscript(script: Script): Transcript {
  const labels = new Map(script.speakers.map((s, i) => [s.label, String(i)]));
  let cursor = START_MS;
  const utterances = script.turns.map((turn, index) => {
    const tokens = turn.text.split(/\s+/).filter(Boolean);
    const words = tokens.map((text, i) => ({
      text,
      start_ms: cursor + i * MS_PER_WORD,
      end_ms: cursor + (i + 1) * MS_PER_WORD,
    }));
    const utterance = {
      index,
      speaker_label: labels.get(turn.speaker) ?? "0",
      start_ms: cursor,
      end_ms: cursor + tokens.length * MS_PER_WORD,
      text: turn.text,
      words,
    };
    cursor = utterance.end_ms + GAP_MS;
    return utterance;
  });

  return { audio_ms: cursor, utterances };
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Pass at least one fixture id, for example meeting-a.");
  process.exit(1);
}

for (const id of ids) {
  const script = JSON.parse(readFileSync(join(FIXTURES, `${id}.script.json`), "utf8")) as Script;
  const transcript = scriptToTranscript(script);
  const target = join(FIXTURES, `${id}.synth.asr.json`);
  writeFileSync(target, `${JSON.stringify(transcript, null, 2)}\n`);
  console.log(`${target}  ${transcript.utterances.length} utterances  ${transcript.audio_ms} ms`);
}
