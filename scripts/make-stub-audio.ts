/**
 * Build placeholder audio for the offline browser layer.
 *
 * The file is not speech: it is a tone whose pitch changes on every utterance
 * boundary of the deterministic transcript, so seeking to an evidence span is
 * audible and verifiable without spending money on providers. It exists only
 * for `tests/e2e/offline.spec.ts` and is never part of the test set.
 *
 * Usage: npx tsx scripts/make-stub-audio.ts meeting-a meeting-b meeting-c
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeWav } from "../src/lib/wav";
import type { Transcript } from "../src/lib/types";

const SAMPLE_RATE = 24_000;
const AUDIO_DIR = join(process.cwd(), "fixtures", "audio");
const FIXTURES = join(process.cwd(), "fixtures");

function toneFor(transcript: Transcript): Buffer {
  const frames = Math.ceil((transcript.audio_ms / 1000) * SAMPLE_RATE);
  const data = Buffer.alloc(frames * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    const ms = (frame / SAMPLE_RATE) * 1000;
    const index = transcript.utterances.findIndex((u) => ms >= u.start_ms && ms < u.end_ms);
    if (index === -1) continue;
    const hz = 220 + (index % 6) * 55;
    data.writeInt16LE(Math.round(6_000 * Math.sin((2 * Math.PI * hz * frame) / SAMPLE_RATE)), frame * 2);
  }
  return writeWav({ sampleRate: SAMPLE_RATE, channels: 1, bitsPerSample: 16, data });
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Pass at least one fixture id, for example meeting-a.");
  process.exit(1);
}

mkdirSync(AUDIO_DIR, { recursive: true });
for (const id of ids) {
  const transcript = JSON.parse(
    readFileSync(join(FIXTURES, `${id}.synth.asr.json`), "utf8"),
  ) as Transcript;
  const target = join(AUDIO_DIR, `${id}.stub.wav`);
  writeFileSync(target, toneFor(transcript));
  console.log(`${target}  ${(transcript.audio_ms / 1000).toFixed(1)} s`);
}
