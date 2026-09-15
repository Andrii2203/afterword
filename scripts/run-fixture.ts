import "./env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDeepgramAsr } from "../src/lib/asr";
import { createAnthropicExtractor } from "../src/lib/extract";
import { score, type ExpectedSet } from "../src/lib/score";
import { computeMetrics } from "../src/lib/metrics";
import { verify } from "../src/lib/verify";
import { DocumentSchema, TranscriptSchema, type Transcript } from "../src/lib/types";

const FIXTURES = join(process.cwd(), "fixtures");
const REPORTS = join(process.cwd(), "reports");

interface Options {
  model?: string;
  tag?: string;
}

async function runOne(id: string, options: Options): Promise<boolean> {
  const suffix = options.tag ? `${options.tag}.` : "";
  const asrPath = join(FIXTURES, `${id}.asr.json`);
  const extractor = createAnthropicExtractor({ model: options.model });

  let asrResult: { transcript: Transcript; ms: number };
  if (options.tag && existsSync(asrPath)) {
    asrResult = {
      transcript: TranscriptSchema.parse(JSON.parse(readFileSync(asrPath, "utf8"))),
      ms: 0,
    };
  } else {
    const audio = new Uint8Array(readFileSync(join(process.cwd(), "public", "samples", `${id}.mp3`)));
    asrResult = await createDeepgramAsr().transcribe(audio, "audio/mpeg");
    writeFileSync(asrPath, `${JSON.stringify(asrResult.transcript, null, 2)}\n`);
  }

  const started = Date.now();
  const extraction = await extractor.extract({ transcript: asrResult.transcript });
  writeFileSync(
    join(FIXTURES, `${id}.${suffix}llm.json`),
    `${JSON.stringify(extraction.output, null, 2)}\n`,
  );

  const verified = verify({ llm: extraction.output, transcript: asrResult.transcript });
  const document = DocumentSchema.parse({
    meta: {
      run_id: `fixture-${id}`,
      created_at: new Date().toISOString(),
      audio_ms: asrResult.transcript.audio_ms,
      filename: `${id}.mp3`,
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
      model: extractor.model,
    }),
    warnings: verified.warnings,
  });
  writeFileSync(
    join(FIXTURES, `${id}.${suffix}document.json`),
    `${JSON.stringify(document, null, 2)}\n`,
  );

  const expected = JSON.parse(
    readFileSync(join(FIXTURES, `${id}.expected.json`), "utf8"),
  ) as ExpectedSet;
  const report = score(document, expected);

  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(
    join(REPORTS, `${id}.${suffix}report.json`),
    `${JSON.stringify({ report, metrics: document.metrics, warnings: document.warnings }, null, 2)}\n`,
  );

  console.log(
    [
      `${id}${options.tag ? ` (${options.tag})` : ""}: ${report.passed ? "PASS" : "FAIL"}`,
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: Options = {
    model: args.find((a) => a.startsWith("--model="))?.slice("--model=".length),
    tag: args.find((a) => a.startsWith("--tag="))?.slice("--tag=".length),
  };
  const ids = args.filter((a) => !a.startsWith("--"));
  if (ids.length === 0) {
    console.error("Pass at least one fixture id, for example meeting-a.");
    process.exit(1);
  }

  let allPassed = true;
  for (const id of ids) allPassed = (await runOne(id, options)) && allPassed;
  process.exitCode = allPassed ? 0 : 1;
}

void main();