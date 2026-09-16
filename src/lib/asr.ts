import type { Transcript } from "./types";

export interface AsrResult {
  transcript: Transcript;
  ms: number;
  raw: unknown;
}

export interface AsrProvider {
  readonly name: string;
  transcribe(audio: Uint8Array, contentType: string): Promise<AsrResult>;
}

export interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    utterances?: {
      start: number;
      end: number;
      transcript: string;
      speaker?: number;
      words?: DeepgramWord[];
    }[];
  };
}

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
  confidence?: number;
  speaker_confidence?: number;
}

type DeepgramUtterance = NonNullable<NonNullable<DeepgramResponse["results"]>["utterances"]>[number];

const ENDPOINT = "https://api.deepgram.com/v1/listen";

export const DEEPGRAM_QUERY = {
  model: "nova-3",
  language: "en",
  diarize: "true",
  utterances: "true",
  punctuate: "true",
  smart_format: "true",
} as const;

export function mapDeepgramResponse(response: DeepgramResponse): Transcript {
  const turns = (response.results?.utterances ?? []).flatMap(splitBySpeaker);
  return {
    audio_ms: toMs(response.metadata?.duration ?? 0),
    utterances: turns.map((turn, index) => ({ index, ...turn })),
  };
}

function splitBySpeaker(utterance: DeepgramUtterance): Omit<Transcript["utterances"][number], "index">[] {
  const fallback = utterance.speaker ?? 0;
  const words = utterance.words ?? [];

  if (words.length === 0) {
    return [
      {
        speaker_label: String(fallback),
        start_ms: toMs(utterance.start),
        end_ms: toMs(utterance.end),
        text: utterance.transcript,
        words: [],
      },
    ];
  }

  const runs: { speaker: number; words: DeepgramWord[] }[] = [];
  for (const word of words) {
    const speaker = word.speaker ?? fallback;
    const last = runs.at(-1);
    if (last && last.speaker === speaker) last.words.push(word);
    else runs.push({ speaker, words: [word] });
  }

  const single = runs.length === 1;
  return runs.map((run) => ({
    speaker_label: String(run.speaker),
    start_ms: toMs(single ? utterance.start : run.words[0].start),
    end_ms: toMs(single ? utterance.end : run.words.at(-1)!.end),
    text: single
      ? utterance.transcript
      : run.words.map((word) => word.punctuated_word ?? word.word).join(" "),
    words: run.words.map((word) => ({
      text: word.punctuated_word ?? word.word,
      start_ms: toMs(word.start),
      end_ms: toMs(word.end),
      ...(word.confidence === undefined ? {} : { confidence: word.confidence }),
      ...(word.speaker_confidence === undefined
        ? {}
        : { speaker_confidence: word.speaker_confidence }),
    })),
  }));
}

function toMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

export function createDeepgramAsr(apiKey = process.env.DEEPGRAM_API_KEY): AsrProvider {
  return {
    name: DEEPGRAM_QUERY.model,
    async transcribe(audio, contentType) {
      if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not set");
      const started = Date.now();
      const url = `${ENDPOINT}?${new URLSearchParams(DEEPGRAM_QUERY)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": contentType },
        body: audio as unknown as BodyInit,
      });
      if (!response.ok) {
        throw new Error(
          `Deepgram returned ${response.status}: ${(await response.text()).slice(0, 400)}`,
        );
      }
      const raw = (await response.json()) as DeepgramResponse;
      return { transcript: mapDeepgramResponse(raw), ms: Date.now() - started, raw };
    },
  };
}