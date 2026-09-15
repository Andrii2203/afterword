/**
 * Every unit price used by the product, in one file (ADR-0010).
 *
 * These are provider list prices, not negotiated rates, and they exclude taxes.
 * `checked_on` is the date a human last compared the number with the source URL.
 * Hosting is reported separately and is never folded into per-operation cost (M4).
 */
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
    model: process.env.EXTRACTION_MODEL ?? "claude-opus-5",
    usd_per_input_mtok: 5,
    usd_per_output_mtok: 25,
    source: "https://www.anthropic.com/pricing",
    checked_on: "2026-09-15",
    note: "Standard tier for claude-opus-5; cached reads are not used by this pipeline.",
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
