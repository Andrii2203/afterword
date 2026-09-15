import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeMp3 } from "../src/lib/mp3";
import type { Transcript } from "../src/lib/types";

const SAMPLE_RATE = 24_000;
const AUDIO_DIR = join(process.cwd(), "fixtures", "audio");
const FIXTURES = join(process.cwd(), "fixtures");

function pcmFor(transcript: Transcript): Buffer {
  const frames = Math.ceil((transcript.audio_ms / 1000) * SAMPLE_RATE);
  const data = Buffer.alloc(frames * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    const ms = (frame / SAMPLE_RATE) * 1000;
    const index = transcript.utterances.findIndex((u) => ms >= u.start_ms && ms < u.end_ms);
    if (index === -1) continue;
    const hz = 220 + (index % 6) * 55;
    data.writeInt16LE(Math.round(6_000 * Math.sin((2 * Math.PI * hz * frame) / SAMPLE_RATE)), frame * 2);
  }
  return data;
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Pass at least one fixture id, for example meeting-a.");
    process.exit(1);
  }

  mkdirSync(AUDIO_DIR, { recursive: true });
  for (const id of ids) {
    const recorded = join(FIXTURES, `${id}.asr.json`);
    const source = existsSync(recorded) ? recorded : join(FIXTURES, `${id}.synth.asr.json`);
    const transcript = JSON.parse(readFileSync(source, "utf8")) as Transcript;

    const mp3 = await encodeMp3({
      sampleRate: SAMPLE_RATE,
      channels: 1,
      bitsPerSample: 16,
      data: pcmFor(transcript),
    });
    const target = join(AUDIO_DIR, `${id}.stub.mp3`);
    writeFileSync(target, mp3);
    console.log(
      `${target}  ${(transcript.audio_ms / 1000).toFixed(1)} s  ${(mp3.length / 1024).toFixed(0)} KB`,
    );
  }
}

void main();