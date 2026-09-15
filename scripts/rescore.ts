/**
 * Score a recorded run again without calling any provider.
 *
 * Usage: npx tsx scripts/rescore.ts meeting-a meeting-b meeting-c
 * Reads fixtures/<id>.document.json produced by scripts/run-fixture.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { score, type ExpectedSet } from "../src/lib/score";
import { DocumentSchema } from "../src/lib/types";

const FIXTURES = join(process.cwd(), "fixtures");

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Pass at least one fixture id, for example meeting-a.");
  process.exit(1);
}

let allPassed = true;
for (const id of ids) {
  const document = DocumentSchema.parse(
    JSON.parse(readFileSync(join(FIXTURES, `${id}.document.json`), "utf8")),
  );
  const expected = JSON.parse(
    readFileSync(join(FIXTURES, `${id}.expected.json`), "utf8"),
  ) as ExpectedSet;
  const report = score(document, expected);
  allPassed = report.passed && allPassed;
  console.log(
    `${id}: ${report.passed ? "PASS" : "FAIL"}  recall ${report.inclusion_recall.toFixed(2)}  precision ${report.exclusion_precision.toFixed(2)}  $${document.metrics.cost_per_audio_minute_usd.toFixed(4)}/audio-min  ${document.metrics.total_ms} ms`,
  );
  for (const failure of report.failures) console.log(`   - ${failure}`);
}
process.exitCode = allPassed ? 0 : 1;
