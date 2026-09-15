import { describe, expect, it } from "vitest";
import { computeMetrics } from "@/lib/metrics";

const usage = {
  audio_seconds: 120,
  asr_ms: 3_000,
  llm_ms: 9_000,
  total_ms: 12_500,
  tokens: { input: 4_000, output: 1_200, retries: 0 },
};

describe("computeMetrics", () => {
  it("prices transcription per audio minute", () => {
    const metrics = computeMetrics(usage);
    expect(metrics.asr_cost_usd).toBeCloseTo(0.0086, 6);
  });

  it("prices the model call from reported token usage", () => {
    const metrics = computeMetrics(usage);
    expect(metrics.llm_cost_usd).toBeCloseTo(4_000 / 1e6 * 5 + 1_200 / 1e6 * 25, 8);
  });

  it("divides the total by audio minutes", () => {
    const metrics = computeMetrics(usage);
    const expected = (metrics.asr_cost_usd + metrics.llm_cost_usd) / 2;
    expect(metrics.cost_per_audio_minute_usd).toBeCloseTo(expected, 8);
  });

  it("returns zero cost per minute for empty audio instead of dividing by zero", () => {
    const metrics = computeMetrics({ ...usage, audio_seconds: 0 });
    expect(metrics.cost_per_audio_minute_usd).toBe(0);
    expect(Number.isFinite(metrics.cost_per_audio_minute_usd)).toBe(true);
  });

  it("reports the models that produced the run", () => {
    const metrics = computeMetrics(usage);
    expect(metrics.models.asr).toBe("nova-3");
    expect(metrics.models.llm).toMatch(/^claude-/);
  });

  it("prices each model at its own rate", () => {
    const opus = computeMetrics({ ...usage, model: "claude-opus-5" });
    const sonnet = computeMetrics({ ...usage, model: "claude-sonnet-5" });
    expect(sonnet.llm_cost_usd).toBeCloseTo(4_000 / 1e6 * 2 + 1_200 / 1e6 * 10, 8);
    expect(sonnet.llm_cost_usd).toBeLessThan(opus.llm_cost_usd);
    expect(sonnet.models.llm).toBe("claude-sonnet-5");
  });

  it("falls back to the default rate for an unknown model", () => {
    const unknown = computeMetrics({ ...usage, model: "claude-unreleased-9" });
    const opus = computeMetrics({ ...usage, model: "claude-opus-5" });
    expect(unknown.llm_cost_usd).toBe(opus.llm_cost_usd);
    expect(unknown.models.llm).toBe("claude-unreleased-9");
  });

  it("carries the retry count through", () => {
    const metrics = computeMetrics({ ...usage, tokens: { input: 10, output: 5, retries: 2 } });
    expect(metrics.tokens.retries).toBe(2);
  });
});
