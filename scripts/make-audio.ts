/**
 * Generate fixture audio from a checked-in script with Deepgram Aura-2 (ADR-0008).
 *
 * Usage: npx tsx scripts/make-audio.ts meeting-a meeting-b meeting-c
 * Requires DEEPGRAM_API_KEY.
 */
import "./env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRICING } from "../src/config/pricing";
import { concatWav, durationMs, parseWav } from "../src/lib/wav";

const GAP_MS = 350;
const SPEAK = "https://api.deepgram.com/v1/speak";
const FIXTURES = join(process.cwd(), "fixtures");
const AUDIO_DIR = join(FIXTURES, "audio");
const PUBLIC_DIR = join(process.cwd(), "public", "samples");

interface Script {
  id: string;
  speakers: { label: string; name: string; voice: string }[];
  turns: { speaker: string; text: string }[];
}

async function speak(text: string, voice: string, apiKey: string): Promise<Buffer> {
  const url = `${SPEAK}?${new URLSearchParams({
    model: voice,
    encoding: "linear16",
    container: "wav",
    sample_rate: "24000",
  })}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`Deepgram speak returned ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function build(id: string, apiKey: string): Promise<void> {
  const script = JSON.parse(readFileSync(join(FIXTURES, `${id}.script.json`), "utf8")) as Script;
  const voices = new Map(script.speakers.map((s) => [s.label, s.voice]));

  const segments: Buffer[] = [];
  let characters = 0;
  for (const turn of script.turns) {
    const voice = voices.get(turn.speaker);
    if (!voice) throw new Error(`Script ${id} has no voice for speaker ${turn.speaker}.`);
    characters += turn.text.length;
    segments.push(await speak(turn.text, voice, apiKey));
  }

  const wav = concatWav(segments, GAP_MS);
  mkdirSync(AUDIO_DIR, { recursive: true });
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(join(AUDIO_DIR, `${id}.wav`), wav);
  writeFileSync(join(PUBLIC_DIR, `${id}.wav`), wav);

  const seconds = durationMs(parseWav(wav)) / 1000;
  const cost = (characters / 1000) * PRICING.tts.usd_per_1k_characters;
  console.log(
    `${id}: ${seconds.toFixed(1)} s, ${characters} characters, tts cost $${cost.toFixed(4)}`,
  );
  if (seconds > 180) console.warn(`${id} is longer than the 180 s limit.`);
}

async function main(): Promise<void> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error("DEEPGRAM_API_KEY is not set.");
    process.exit(1);
  }
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Pass at least one fixture id, for example meeting-a.");
    process.exit(1);
  }
  for (const id of ids) await build(id, apiKey);
}

void main();
