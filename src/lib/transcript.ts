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

export const MIN_WORD_CONFIDENCE = 0.9;
export const MIN_SPEAKER_CONFIDENCE = 0.3;

export type Uncertainty = "recognition" | "speaker" | null;

export function uncertaintyOf(utterance: Utterance, startMs: number, endMs: number): Uncertainty {
  const words = utterance.words.filter((w) => w.start_ms >= startMs && w.end_ms <= endMs);
  const below = (value: number | undefined, limit: number) => value !== undefined && value < limit;
  if (words.some((w) => below(w.confidence, MIN_WORD_CONFIDENCE))) return "recognition";
  if (words.some((w) => below(w.speaker_confidence, MIN_SPEAKER_CONFIDENCE))) return "speaker";
  return null;
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