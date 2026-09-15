export const DEFAULT_EXTRACTION_MODEL = "claude-opus-5";

export const LLM_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function llmPrice(model: string): { input: number; output: number } {
  return LLM_PRICES[model] ?? LLM_PRICES[DEFAULT_EXTRACTION_MODEL];
}

export const PRICING = {
  asr: {
    provider: "Deepgram",
    model: "nova-3",
    usd_per_audio_minute: 0.0043,
    source: "https://deepgram.com/pricing",
    checked_on: "2026-09-15",
    note: "Pay-as-you-go pre-recorded transcription; diarization is included in the base rate.",
  },
  llm: {
    provider: "Anthropic",
    model: process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL,
    source: "https://www.anthropic.com/pricing",
    checked_on: "2026-09-15",
    note: "Standard tier; this pipeline makes one call per recording and uses no prompt caching.",
  },
  tts: {
    provider: "Deepgram",
    model: "aura-2",
    usd_per_1k_characters: 0.03,
    source: "https://deepgram.com/pricing",
    checked_on: "2026-09-15",
    note: "Used only to generate test fixtures, never in the user flow.",
  },
  hosting: {
    note: "Vercel Hobby is used for the demo; hosting is a fixed monthly cost and is excluded from cost per operation.",
  },
} as const;

export type Pricing = typeof PRICING;