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

/** The subset of the Deepgram pre-recorded response this product depends on. */
export interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    utterances?: {
      start: number;
      end: number;
      transcript: string;
      speaker?: number;
      words?: { word: string; punctuated_word?: string; start: number; end: number }[];
    }[];
  };
}

const ENDPOINT = "https://api.deepgram.com/v1/listen";

export const DEEPGRAM_QUERY = {
  model: "nova-3",
  language: "en",
  diarize: "true",
  utterances: "true",
  punctuate: "true",
  smart_format: "true",
} as const;

/** Deepgram seconds to the product's millisecond transcript (ADR-0002). */
export function mapDeepgramResponse(response: DeepgramResponse): Transcript {
  const utterances = response.results?.utterances ?? [];
  return {
    audio_ms: Math.round((response.metadata?.duration ?? 0) * 1000),
    utterances: utterances.map((u, index) => ({
      index,
      speaker_label: String(u.speaker ?? 0),
      start_ms: Math.round(u.start * 1000),
      end_ms: Math.round(u.end * 1000),
      text: u.transcript,
      words: (u.words ?? []).map((w) => ({
        text: w.punctuated_word ?? w.word,
        start_ms: Math.round(w.start * 1000),
        end_ms: Math.round(w.end * 1000),
      })),
    })),
  };
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
