import "./env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRICING } from "../src/config/pricing";
import { createAnthropicExtractor } from "../src/lib/extract";
import { computeMetrics } from "../src/lib/metrics";
import { score, type ExpectedSet } from "../src/lib/score";
import { TranscriptSchema, DocumentSchema } from "../src/lib/types";
import { verify } from "../src/lib/verify";

const FIXTURES = join(process.cwd(), "fixtures");
const REPORTS = join(process.cwd(), "reports");

interface Sample {
  id: string;
  iteration: number;
  passed: boolean;
  llm_ms: number;
  input_tokens: number;
  output_tokens: number;
  llm_cost_usd: number;
  run_cost_usd: number;
  failures: string[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const repeat = Number(args.find((a) => a.startsWith("--repeat="))?.slice(9) ?? 3);
  const model = args.find((a) => a.startsWith("--model="))?.slice(8) ?? PRICING.llm.model;
  const ids = args.filter((a) => !a.startsWith("--"));
  const fixtures = ids.length > 0 ? ids : ["meeting-a", "meeting-b", "meeting-c"];

  const extractor = createAnthropicExtractor({ model });
  const samples: Sample[] = [];

  for (const id of fixtures) {
    const transcript = TranscriptSchema.parse(
      JSON.parse(readFileSync(join(FIXTURES, `${id}.asr.json`), "utf8")),
    );
    const expected = JSON.parse(
      readFileSync(join(FIXTURES, `${id}.expected.json`), "utf8"),
    ) as ExpectedSet;

    for (let iteration = 1; iteration <= repeat; iteration += 1) {
      const extraction = await extractor.extract({ transcript });
      const verified = verify({ llm: extraction.output, transcript });
      const metrics = computeMetrics({
        audio_seconds: transcript.audio_ms / 1000,
        asr_ms: 0,
        llm_ms: extraction.ms,
        total_ms: extraction.ms,
        tokens: extraction.tokens,
        model,
      });
      const document = DocumentSchema.parse({
        meta: {
          run_id: `bench-${id}-${iteration}`,
          created_at: new Date().toISOString(),
          audio_ms: transcript.audio_ms,
          filename: `${id}.wav`,
          anchor_date: verified.anchor.date,
          anchor_date_source: verified.anchor.source,
        },
        speakers: verified.speakers,
        commitments: verified.commitments,
        excluded: verified.excluded,
        open_questions: verified.open_questions,
        transcript,
        metrics,
        warnings: verified.warnings,
      });
      const report = score(document, expected);
      samples.push({
        id,
        iteration,
        passed: report.passed,
        llm_ms: metrics.llm_ms,
        input_tokens: metrics.tokens.input,
        output_tokens: metrics.tokens.output,
        llm_cost_usd: metrics.llm_cost_usd,
        run_cost_usd: Number((metrics.llm_cost_usd + metrics.asr_cost_usd).toFixed(6)),
        failures: report.failures,
      });
      console.log(
        `${id} #${iteration}  ${report.passed ? "PASS" : "FAIL"}  ${metrics.llm_ms} ms  ${metrics.tokens.input}/${metrics.tokens.output} tokens  $${metrics.llm_cost_usd.toFixed(4)} model` +
          (report.passed ? "" : `  ${report.failures.join("; ")}`),
      );
    }
  }

  const latencies = samples.map((s) => s.llm_ms);
  const costs = samples.map((s) => s.run_cost_usd);
  const summary = {
    model,
    repeat,
    samples_total: samples.length,
    passed: samples.filter((s) => s.passed).length,
    llm_ms: { min: Math.min(...latencies), median: median(latencies), max: Math.max(...latencies) },
    run_cost_usd: {
      min: Math.min(...costs),
      median: Number(median(costs).toFixed(6)),
      max: Math.max(...costs),
    },
    note: "Extraction only; transcription latency is measured separately by run-fixture.",
  };

  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(
    join(REPORTS, `benchmark.${model}.json`),
    `${JSON.stringify({ summary, samples }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}

void main();