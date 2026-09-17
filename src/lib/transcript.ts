import type { Transcript, Utterance } from "./types";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/(^|\s)'+|'+(\s|$)/g, "$1$2")
    .trim()
    .replace(/\s+/g, " ");
}

export function msToClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function speakerDisplay(label: string, names: Record<string, string>): string {
  return names[label] ?? `speaker_${label}`;
}

export function renderTranscript(
  transcript: Transcript,
  names: Record<string, string> = {},
): string {
  return transcript.utterances
    .map(
      (u) =>
        `[${u.index}] ${speakerDisplay(u.speaker_label, names)} ${msToClock(u.start_ms)} | ${u.text}`,
    )
    .join("\n");
}

export const WORD_CONFIDENCE_CEILING = 0.9;
export const SPEAKER_CONFIDENCE_CEILING = 0.3;
export const CONFIDENCE_PERCENTILE = 0.05;
export const CONFIDENCE_SAMPLE = 20;

const FILLER = /^(uh|um|mm|mhmm|hmm|huh|yeah|yep|okay|ok|oh|ah|so|well|like|right|mm-hmm|uh-huh)[.,!?]*$/i;

export type Uncertainty = "recognition" | "speaker" | null;

export interface ConfidenceLimits {
  word: number;
  speaker: number;
}

export function confidenceLimits(transcript: Transcript): ConfidenceLimits {
  const words = transcript.utterances.flatMap((u) => u.words);
  return {
    word: limitOf(
      words.map((w) => w.confidence).filter(isNumber),
      WORD_CONFIDENCE_CEILING,
    ),
    speaker: limitOf(
      words.map((w) => w.speaker_confidence).filter(isNumber),
      SPEAKER_CONFIDENCE_CEILING,
    ),
  };
}

export function uncertaintyOf(
  utterance: Utterance,
  startMs: number,
  endMs: number,
  limits: ConfidenceLimits,
): Uncertainty {
  const words = utterance.words.filter(
    (w) => w.start_ms >= startMs && w.end_ms <= endMs && !FILLER.test(w.text.trim()),
  );
  const below = (value: number | undefined, limit: number) => value !== undefined && value < limit;
  if (words.some((w) => below(w.confidence, limits.word))) return "recognition";
  if (words.some((w) => below(w.speaker_confidence, limits.speaker))) return "speaker";
  return null;
}

function limitOf(values: number[], ceiling: number): number {
  if (values.length < CONFIDENCE_SAMPLE) return ceiling;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.min(ceiling, sorted[Math.floor(CONFIDENCE_PERCENTILE * (sorted.length - 1))]);
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}

export interface QuoteHit {
  utterance_index: number;
  speaker_label: string;
  start_ms: number;
  end_ms: number;
}

export function locateQuote(
  transcript: Transcript,
  quote: string,
  hintIndex: number,
): QuoteHit | null {
  const needle = normalize(quote);
  if (!needle) return null;

  const hinted = transcript.utterances.find((u) => u.index === hintIndex);
  const candidates = hinted ? [hinted, ...transcript.utterances] : transcript.utterances;
  const match = candidates.find((u) => normalize(u.text).includes(needle));
  if (!match) return null;

  const span = alignWords(match, needle);
  return {
    utterance_index: match.index,
    speaker_label: match.speaker_label,
    start_ms: span?.start_ms ?? match.start_ms,
    end_ms: span?.end_ms ?? match.end_ms,
  };
}

function alignWords(
  utterance: Utterance,
  needle: string,
): { start_ms: number; end_ms: number } | null {
  if (utterance.words.length === 0) return null;

  const tokens: { token: string; wordIndex: number }[] = [];
  utterance.words.forEach((word, wordIndex) => {
    for (const token of normalize(word.text).split(" ")) {
      if (token) tokens.push({ token, wordIndex });
    }
  });

  const needleTokens = needle.split(" ");
  for (let start = 0; start + needleTokens.length <= tokens.length; start += 1) {
    let hit = true;
    for (let offset = 0; offset < needleTokens.length; offset += 1) {
      if (tokens[start + offset].token !== needleTokens[offset]) {
        hit = false;
        break;
      }
    }
    if (!hit) continue;
    const firstWord = utterance.words[tokens[start].wordIndex];
    const lastWord = utterance.words[tokens[start + needleTokens.length - 1].wordIndex];
    return { start_ms: firstWord.start_ms, end_ms: lastWord.end_ms };
  }
  return null;
}