/**
 * Run the real pipeline over fixture audio, score it against the expected list
 * and record the run for offline tests.
 *
 * Usage: npx tsx scripts/run-fixture.ts meeting-a meeting-b meeting-c
 * Requires DEEPGRAM_API_KEY and ANTHROPIC_API_KEY.
 * Writes fixtures/<id>.asr.json, fixtures/<id>.llm.json, fixtures/<id>.document.json
 * and reports/<id>.report.json.
 */
import "./env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDeepgramAsr } from "../src/lib/asr";
import { createAnthropicExtractor } from "../src/lib/extract";
import { score, type ExpectedSet } from "../src/lib/score";
import { computeMetrics } from "../src/lib/metrics";
import { verify } from "../src/lib/verify";
import { DocumentSchema } from "../src/lib/types";

const FIXTURES = join(process.cwd(), "fixtures");
const REPORTS = join(process.cwd(), "reports");

async function runOne(id: string) {
  const audio = new Uint8Array(readFileSync(join(FIXTURES, "audio", `${id}.wav`)));
  const asr = createDeepgramAsr();
  const extractor = createAnthropicExtractor();

  // The pipeline is used exactly as the route uses it; the stages are re-run
  // below only to persist their intermediate output for the offline tests.
  const asrResult = await asr.transcribe(audio, "audio/wav");
  writeFileSync(
    join(FIXTURES, `${id}.asr.json`),
    `${JSON.stringify(asrResult.transcript, null, 2)}\n`,
  );

  const started = Date.now();
  const extraction = await extractor.extract({ transcript: asrResult.transcript });
  writeFileSync(join(FIXTURES, `${id}.llm.json`), `${JSON.stringify(extraction.output, null, 2)}\n`);

  const verified = verify({ llm: extraction.output, transcript: asrResult.transcript });
  const document = DocumentSchema.parse({
    meta: {
      run_id: `fixture-${id}`,
      created_at: new Date().toISOString(),
      audio_ms: asrResult.transcript.audio_ms,
      filename: `${id}.wav`,
      anchor_date: verified.anchor.date,
      anchor_date_source: verified.anchor.source,
    },
    speakers: verified.speakers,
    commitments: verified.commitments,
    excluded: verified.excluded,
    open_questions: verified.open_questions,
    transcript: asrResult.transcript,
    metrics: computeMetrics({
      audio_seconds: asrResult.transcript.audio_ms / 1000,
      asr_ms: asrResult.ms,
      llm_ms: extraction.ms,
      total_ms: asrResult.ms + (Date.now() - started),
      tokens: extraction.tokens,
    }),
    warnings: verified.warnings,
  });
  writeFileSync(join(FIXTURES, `${id}.document.json`), `${JSON.stringify(document, null, 2)}\n`);

  const expected = JSON.parse(
    readFileSync(join(FIXTURES, `${id}.expected.json`), "utf8"),
  ) as ExpectedSet;
  const report = score(document, expected);

  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(
    join(REPORTS, `${id}.report.json`),
    `${JSON.stringify({ report, metrics: document.metrics, warnings: document.warnings }, null, 2)}\n`,
  );

  console.log(
    [
      `${id}: ${report.passed ? "PASS" : "FAIL"}`,
      `recall ${report.inclusion_recall.toFixed(2)}`,
      `precision ${report.exclusion_precision.toFixed(2)}`,
      `asr ${document.metrics.asr_ms} ms`,
      `llm ${document.metrics.llm_ms} ms`,
      `total ${document.metrics.total_ms} ms`,
      `$${document.metrics.cost_per_audio_minute_usd.toFixed(4)}/audio-min`,
      `tokens ${document.metrics.tokens.input}/${document.metrics.tokens.output}`,
    ].join("  "),
  );
  for (const failure of report.failures) console.log(`   - ${failure}`);
  return report.passed;
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Pass at least one fixture id, for example meeting-a.");
  process.exit(1);
}

let allPassed = true;
for (const id of ids) allPassed = (await runOne(id)) && allPassed;
process.exit(allPassed ? 0 : 1);
