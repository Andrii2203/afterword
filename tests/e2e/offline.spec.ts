import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const AUDIO = (id: string) => join(process.cwd(), "fixtures", "audio", `${id}.stub.mp3`);

test.skip(
  process.env.STUB_PROVIDERS !== "1" || !existsSync(AUDIO("meeting-a")),
  "Run with npm run test:e2e:offline.",
);

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
  await page.getByTestId("process-button").click();
  await waitForResult(page, 30_000);
}

test("renders the final state of every task", async ({ page }) => {
  await analyse(page, "meeting-a");

  const commitments = page.getByTestId("commitment");
  await expect(commitments).toHaveCount(3);
  await expect(commitments.filter({ hasText: /duplicate/i })).toHaveCount(1);
  await expect(commitments.filter({ hasText: /checklist/i })).toHaveCount(1);
  await expect(commitments.filter({ hasText: /runbook/i })).toHaveCount(1);
  await expect(commitments.filter({ hasText: /progress bar/i })).toHaveCount(0);
  await expect(commitments.filter({ hasText: /migration/i })).toHaveCount(0);

  await expect(page.getByTestId("excluded").filter({ hasText: /migration/i })).toHaveAttribute(
    "data-reason",
    "cancelled",
  );
  await expect(page.getByTestId("excluded").filter({ hasText: /progress bar/i })).toHaveAttribute(
    "data-reason",
    "never_accepted",
  );
  await expect(page.getByTestId("open-question")).toHaveCount(1);
  await expect(page.getByTestId("unassigned")).toHaveCount(1);
  const checklist = commitments.filter({ hasText: /checklist/i });
  await expect(checklist.getByTestId("superseded").filter({ hasText: /tuesday/i })).not.toHaveCount(0);
  await expect(checklist.getByTestId("superseded").filter({ hasText: /thursday/i })).toHaveCount(0);
  await expect(checklist).toContainText(/thursday/i);
  await expect(page.getByTestId("deadline-unresolved").first()).toContainText("no date context");
  await expect(page.getByTestId("warning").filter({ hasText: /No calendar date/ })).toBeVisible();
});

test("plays the audio segment behind a quote and stops at its end", async ({ page }) => {
  await analyse(page, "meeting-a");

  const chip = page.getByTestId("evidence-play").first();
  const startMs = Number(await chip.getAttribute("data-start-ms"));
  const endMs = Number(await chip.getAttribute("data-end-ms"));
  expect(endMs).toBeGreaterThan(startMs);

  await chip.click();
  const player = page.getByTestId("player");
  await expect
    .poll(() => player.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(startMs / 1000 - 0.25);

  await expect
    .poll(() => player.evaluate((el: HTMLAudioElement) => el.paused), { timeout: 20_000 })
    .toBe(true);

  const stoppedAt = await player.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(stoppedAt).toBeGreaterThanOrEqual(startMs / 1000 - 0.25);
  expect(stoppedAt).toBeLessThanOrEqual(endMs / 1000 + 1);
});

test("promotes the proposal only in the variant where it was accepted", async ({ page }) => {
  await analyse(page, "meeting-b");
  await expect(page.getByTestId("commitment")).toHaveCount(4);
  await expect(page.getByTestId("commitment").filter({ hasText: /progress bar/i })).toHaveCount(1);
  await expect(page.getByTestId("excluded").filter({ hasText: /progress bar/i })).toHaveCount(0);
});

test("declines to conclude on a hedged acceptance", async ({ page }) => {
  await analyse(page, "meeting-c");
  await expect(page.getByTestId("commitment").filter({ hasText: /documentation/i })).toHaveCount(0);
  await expect(page.getByTestId("excluded").filter({ hasText: /documentation/i })).toHaveAttribute(
    "data-reason",
    "ambiguous",
  );
  await expect(page.getByTestId("open-question")).toHaveCount(2);
  await expect(page.getByTestId("deadline-resolved")).toContainText("2026-03-06");
});

test("follows the spoken date over the recording date field and explains the disagreement", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("upload-input").setInputFiles(AUDIO("meeting-c"));
  await page.getByTestId("anchor-date").fill("2026-09-16");
  await page.getByTestId("process-button").click();
  await waitForResult(page, 30_000);

  await expect(page.getByTestId("deadline-resolved")).toContainText("2026-03-06");
  const conflict = page.getByTestId("warning").filter({ hasText: /recording date field/ });
  await expect(conflict).toContainText("2026-03-02");
  await expect(conflict).toContainText("2026-09-16");
});

test("shows the quotes under an item in time order, each with its role", async ({ page }) => {
  await analyse(page, "meeting-c");

  const item = page.getByTestId("commitment").filter({ hasText: /backup/i });
  const chips = item.getByTestId("evidence-play");
  const starts = await chips.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-start-ms"))),
  );
  expect(starts.length).toBeGreaterThan(1);
  expect(starts).toEqual([...starts].sort((a, b) => a - b));

  await expect(item.getByTestId("evidence-role")).toHaveCount(starts.length);
  const roles = await item.getByTestId("evidence-role").allTextContents();
  expect(roles.every((role) => role.trim().length > 0)).toBe(true);
  await expect(item.getByTestId("evidence-role").filter({ hasText: "acceptance" })).not.toHaveCount(
    0,
  );
});

test("says why a deadline stayed unresolved, and only says the date is missing when it is", async ({
  page,
}) => {
  await analyse(page, "meeting-a");
  await expect(page.getByTestId("deadline-unresolved").first()).toContainText("no date context");

  await page.goto("/");
  await page.getByTestId("upload-input").setInputFiles(AUDIO("meeting-a"));
  await page.getByTestId("anchor-date").fill("2026-03-02");
  await page.getByTestId("process-button").click();
  await waitForResult(page, 30_000);

  const unresolved = page.getByTestId("deadline-unresolved").first();
  await expect(unresolved).toContainText("not converted to a date");
  await expect(unresolved).not.toContainText("no date context");
});

test("marks the quote recognised with low confidence and the item it supports", async ({ page }) => {
  await analyse(page, "meeting-c");

  const flagged = page.getByTestId("evidence-uncertain");
  await expect(flagged.first()).toBeVisible();
  await expect(flagged.first()).toHaveText(/check this/i);

  const item = page
    .getByTestId("open-question")
    .filter({ has: page.getByTestId("evidence-uncertain") });
  await expect(item.getByTestId("item-uncertain").first()).toBeVisible();

  await analyse(page, "meeting-a");
  const confident = page
    .getByTestId("commitment")
    .filter({ hasText: /duplicate/i })
    .getByTestId("item-uncertain");
  await expect(confident).toHaveCount(0);
});

test("processes the second upload instead of repeating the first answer", async ({ page }) => {
  await analyse(page, "meeting-a");
  const first = await page.getByTestId("commitment").allTextContents();
  await analyse(page, "meeting-c");
  const second = await page.getByTestId("commitment").allTextContents();
  expect(second).not.toEqual(first);
});

test("loads a bundled sample and processes it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sample-meeting-c").click();
  await expect(page.getByTestId("player")).toBeVisible();
  await page.getByTestId("process-button").click();
  await waitForResult(page, 30_000);
  await expect(page.getByTestId("commitment")).toHaveCount(1);
});

test("rejects a file that is not audio", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("upload-input")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.getByTestId("process-button").click();
  await expect(page.getByTestId("error")).toContainText(/Unsupported audio type|180 s/);
});