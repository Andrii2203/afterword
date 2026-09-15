import { PRICING } from "@/config/pricing";
import type { Metrics } from "./types";

export interface UsageInput {
  audio_seconds: number;
  asr_ms: number;
  llm_ms: number;
  total_ms: number;
  tokens: { input: number; output: number; retries: number };
}

/** SPEC M1-M5: cost is computed from measured usage, never from a target. */
export function computeMetrics(usage: UsageInput): Metrics {
  const minutes = usage.audio_seconds / 60;
  const asrCost = minutes * PRICING.asr.usd_per_audio_minute;
  const llmCost =
    (usage.tokens.input / 1e6) * PRICING.llm.usd_per_input_mtok +
    (usage.tokens.output / 1e6) * PRICING.llm.usd_per_output_mtok;

  return {
    audio_seconds: round(usage.audio_seconds, 3),
    asr_ms: Math.round(usage.asr_ms),
    llm_ms: Math.round(usage.llm_ms),
    total_ms: Math.round(usage.total_ms),
    asr_cost_usd: round(asrCost, 6),
    llm_cost_usd: round(llmCost, 6),
    cost_per_audio_minute_usd: minutes > 0 ? round((asrCost + llmCost) / minutes, 6) : 0,
    tokens: usage.tokens,
    models: { asr: PRICING.asr.model, llm: PRICING.llm.model },
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
