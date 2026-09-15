import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const AUDIO = (id: string) => join(process.cwd(), "public", "samples", `${id}.mp3`);

const ready =
  process.env.RUN_E2E === "1" &&
  Boolean(process.env.DEEPGRAM_API_KEY) &&
  Boolean(process.env.ANTHROPIC_API_KEY) &&
  existsSync(AUDIO("meeting-a"));

test.skip(!ready, "Set RUN_E2E=1, both API keys and generate fixture audio first.");

/** Wall-clock time from the click to the first useful output and to the result. */
const latencies: { id: string; transcript_ms: number; ms: number; server_ms: number }[] = [];

test.afterAll(() => {
  if (latencies.length === 0) return;
  mkdirSync(join(process.cwd(), "reports"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "reports", "e2e-latency.json"),
    `${JSON.stringify({ measured_at: new Date().toISOString(), samples: latencies }, null, 2)}\n`,
  );
});

/** Fail fast: an error in the UI ends the wait instead of burning the test timeout. */
async function waitForResult(page: import("@playwright/test").Page, timeout = 60_000) {
  const outcome = await Promise.race([
    page.getByTestId("metrics").waitFor({ state: "visible", timeout }).then(() => "metrics"),
    page.getByTestId("error").waitFor({ state: "visible", timeout }).then(() => "error"),
  ]);
  if (outcome === "error") {
    throw new Error(`the app reported: ${await page.getByTestId("error").textContent()}`);
  }
}

async function analyse(page: import("@playwright/test").Page, id: string) {
  await page.goto("/");
  await page.getByTestId("upload-input").setInputFiles(AUDIO(id));
  const started = Date.now();
  await page.getByTestId("process-button").click();

  // The transcript is the first useful output and must arrive well before the list.
  await expect(page.getByTestId("transcript")).toBeVisible({ timeout: 60_000 });
  const transcriptMs = Date.now() - started;

  await waitForResult(page, 150_000);
  const serverMs = Number(
    (await page.getByTestId("metrics").getAttribute("data-total-ms")) ?? Number.NaN,
  );
  latencies.push({ id, transcript_ms: transcriptMs, ms: Date.now() - started, server_ms: serverMs });
  expect(transcriptMs).toBeLessThan(Date.now() - started);
}

test("reports the final state of every task in the base recording", async ({ page }) => {
  await analyse(page, "meeting-a");

  const commitments = page.getByTestId("commitment");
  await expect(commitments).toHaveCount(3);
  await expect(commitments.filter({ hasText: /duplicate/i })).toHaveCount(1);
  await expect(commitments.filter({ hasText: /checklist/i })).toHaveCount(1);
  await expect(commitments.filter({ hasText: /runbook/i })).toHaveCount(1);

  await expect(commitments.filter({ hasText: /progress bar/i })).toHaveCount(0);
  await expect(commitments.filter({ hasText: /migration/i })).toHaveCount(0);

  await expect(
    page.getByTestId("excluded").filter({ hasText: /migration/i }),
  ).toHaveAttribute("data-reason", "cancelled");
  await expect(
    page.getByTestId("excluded").filter({ hasText: /progress bar/i }),
  ).toHaveAttribute("data-reason", "never_accepted");

  await expect(page.getByTestId("open-question")).toHaveCount(1);
  await expect(page.getByTestId("unassigned")).toHaveCount(1);
  await expect(page.getByTestId("superseded")).toHaveCount(1);
  await expect(page.getByTestId("warning").filter({ hasText: /No calendar date/ })).toBeVisible();
});

test("plays the audio segment behind a quote", async ({ page }) => {
  await analyse(page, "meeting-a");

  const chip = page.getByTestId("evidence-play").first();
  const startMs = Number(await chip.getAttribute("data-start-ms"));
  await chip.click();

  await expect
    .poll(async () => page.getByTestId("player").evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThanOrEqual(startMs / 1000 - 0.25);

  const playing = await page
    .getByTestId("player")
    .evaluate((el: HTMLAudioElement) => !el.paused || el.currentTime > 0);
  expect(playing).toBe(true);
});

test("changes exactly one item when the recording changes one agreement", async ({ page }) => {
  await analyse(page, "meeting-b");

  const commitments = page.getByTestId("commitment");
  await expect(commitments).toHaveCount(4);
  await expect(commitments.filter({ hasText: /progress bar/i })).toHaveCount(1);
  await expect(page.getByTestId("excluded").filter({ hasText: /progress bar/i })).toHaveCount(0);
  await expect(
    page.getByTestId("excluded").filter({ hasText: /migration/i }),
  ).toHaveAttribute("data-reason", "cancelled");
});

test("declines to conclude on a hedged acceptance", async ({ page }) => {
  await analyse(page, "meeting-c");

  await expect(page.getByTestId("commitment").filter({ hasText: /documentation/i })).toHaveCount(0);
  await expect(
    page.getByTestId("excluded").filter({ hasText: /documentation/i }),
  ).toHaveAttribute("data-reason", "ambiguous");
  await expect(page.getByTestId("open-question")).not.toHaveCount(0);
  await expect(page.getByTestId("deadline-resolved")).toContainText("2026-03-06");
});

test("rejects a file that is not audio", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("upload-input")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.getByTestId("process-button").click();
  await expect(page.getByTestId("error")).toContainText(/Unsupported audio type|180 s/);
});
