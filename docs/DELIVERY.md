# Delivery notes — Afterword

Measured on 2026-09-15 on a Windows 11 laptop, `next start` on localhost, Deepgram `nova-3` and
`claude-opus-5` over the public internet. Every number below comes from a recorded run in
`reports/`; nothing here is an estimate.

## 1. What was built

A browser demo that turns one recorded project discussion into the commitments as they stood when
the recording ended, with a playable timestamped quote behind every line. The full contract is in
`docs/spec/SPEC.md` and every decision is in `docs/adr/ADR.md`.

## 2. Sample inputs, expected and actual

The test set is three conversations. Each has a script, generated audio, a transcript, and an
expected commitments list written before the pipeline was ever run against it.

| Fixture | Audio | Result | Recall | Precision |
| --- | --- | --- | --- | --- |
| `meeting-a` | 105.9 s | PASS | 1.00 | 1.00 |
| `meeting-b` | 108.0 s | PASS | 1.00 | 1.00 |
| `meeting-c` | 42.5 s | PASS | 1.00 | 1.00 |

`meeting-a` contains all five required cases. Actual output:

| Item | Expected | Actual |
| --- | --- | --- |
| Duplicate welcome email | commitment, Daniel Okafor, "by the end of the week" unresolved | as expected |
| Onboarding checklist copy | commitment, Maya Chen, "by Thursday", superseded "by Tuesday" | as expected |
| Release runbook | commitment, owner unassigned | as expected |
| Progress bar | excluded, `never_accepted` | as expected |
| Migration script | excluded, `cancelled` | as expected |
| Legal review of consent text | open question | as expected |
| Warnings | `missing_date_context` | as expected |

`meeting-b` is `meeting-a` with one agreement changed: the progress bar is accepted. Actual output
moves that one item from `excluded` to `commitments` with Daniel Okafor as owner and leaves the
other four items unchanged in topic, owner and deadline state.

`meeting-c` is the decline case. The hedged "let's call it a maybe" produced `excluded` with reason
`ambiguous` plus two open questions, and the spoken date 2 March 2026 resolved "by this Friday" to
`2026-03-06`.

## 3. What failed

Defects found so far. Every one is fixed and covered by a test that would have caught it.

| Defect | Symptom | Fix |
| --- | --- | --- |
| Wrong speaker on merged turns ([#1](https://github.com/Andrii2203/afterword/issues/1)) | Deepgram merges adjacent turns separated by a short pause into one utterance, and the product took the speaker from the utterance, so quotes appeared under the other person's name; found in the manual review, not by a test | Utterances are split wherever the speaker of a word changes, and integration tests now assert who said eight known phrases and that every quote sits under its utterance's speaker |
| Upload too large for the platform | The 5.2 MB WAV samples exceeded the 4.5 MB request body limit, so the deployed demo would have returned 413 on its own examples | Recordings are 48 kbps MP3, about 0.6 MB, and the browser refuses anything above the limit (ADR-0023) |
| Placeholder audio left behind | Lowering the upload cap broke the offline browser suite, whose placeholder recordings were still 5 MB WAV | The placeholder is encoded the same way as a real recording, and an integration test now asserts every bundled sample is inside the cap |
| Stale filename rule | After the format change the stubbed layer derived the fixture id from `meeting-a.stub.mp3` as `meeting-a.stub` and answered 500 | The rule is one exported function with its own unit test |
| Written date form | `smart_format` rewrote "March second, twenty twenty six" as `03/02/2026`, which the anchor parser did not read, so a resolvable deadline was reported as unresolved | `findAnchorDate` accepts the US written order (ADR-0020) |
| Speaker label mismatch | The model echoed the display label `speaker_0` instead of the diarization label `0`, so no name ever bound and every quote lost its speaker | `verify` resolves a claimed label against the transcript and falls back to the speaker of the quoted utterance |
| Prompt gap | An agreed task with no named owner was classified `never_accepted`, losing a real commitment | The prompt states that acceptance and ownership are independent |

Two test-side corrections, disclosed because they changed the ground truth or the assertions:

1. `meeting-c` expected one exact quote as evidence for the ambiguous item; three utterances decide
   that item equally, so the assertion now accepts any of them. Demanding one exact quote tested the
   model's phrasing preference, not correctness.
2. An integration test compared commitment titles verbatim between two independent model runs. Title
   wording is free text, so the test now compares topic, owner status and deadline status.

Open issues from the manual review on 2026-09-16, none of which the automated suites caught
(`docs/testing/2026-09-16-manual-review.md`):

| ID | Severity | Summary |
| --- | --- | --- |
| [#5](https://github.com/Andrii2203/afterword/issues/5) | Medium | A quote containing a word recognised with low confidence is not flagged |
| [#4](https://github.com/Andrii2203/afterword/issues/4) | Medium | Quotes under an item are out of order and their role is hidden |
| [#3](https://github.com/Andrii2203/afterword/issues/3) | Low | An unresolved deadline says "no date context" when a date is known |

Known limits, not fixed:

- Diarization is trusted as given; two speakers on one channel who talk over each other are out of
  scope and untested.
- The fixture audio is synthetic speech, so real-room noise, accents and crosstalk are unmeasured.
- Uploads are capped at 4.5 MB because that is the deployment target's request body limit; a three
  minute WAV does not fit and has to be compressed first. The product says so before sending.

## 4. Speed

Results stream, so there are two numbers that matter: when the user first sees something real, and
when the commitments list is complete. Both are measured in the browser from the click
(`reports/e2e-latency.json`):

| Fixture | Audio | Transcript visible | Full result | Server total |
| --- | --- | --- | --- | --- |
| `meeting-a` | 105.9 s | 2.5 s | 14.1 s | 13.7 s |
| `meeting-a` (repeat) | 105.9 s | 2.0 s | 14.2 s | 14.0 s |
| `meeting-b` | 108.0 s | 2.0 s | 12.7 s | 12.2 s |
| `meeting-c` | 42.5 s | 1.5 s | 10.6 s | 9.9 s |

Stage split across the recorded runs: transcription 1.4–4.3 s, extraction 9.8–15.6 s. Transcription
of the same MP3 files ranged that widely from run to run, so it tracks network conditions rather than
file size. The model is
the whole latency budget; transcription is noise. Nine extraction samples on `claude-opus-5` gave a
median of 13.2 s with a range of 9.4–36.8 s (`reports/benchmark.claude-opus-5.json`).

## 5. Cost

Unit prices, all list price, all in `src/config/pricing.ts` with source and check date:

| Item | Price | Source |
| --- | --- | --- |
| Deepgram `nova-3` pre-recorded | $0.0043 per audio minute | deepgram.com/pricing, checked 2026-09-15 |
| `claude-opus-5` | $5 per Mtok in, $25 per Mtok out | anthropic.com/pricing, checked 2026-09-15 |
| Deepgram `aura-2` speech | $0.030 per 1000 characters | deepgram.com/pricing, checked 2026-09-15 |

Measured cost per operation:

| Fixture | Transcription | Model | Total per run | Per audio minute |
| --- | --- | --- | --- | --- |
| `meeting-a` | $0.00759 | $0.04434 | $0.0519 | $0.0294 |
| `meeting-b` | $0.00774 | $0.04561 | $0.0534 | $0.0296 |
| `meeting-c` | $0.00305 | $0.03975 | $0.0428 | $0.0604 |

Across nine `claude-opus-5` samples the cost per run was $0.0417 minimum, $0.0514 median, $0.0677
maximum.

Pricing assumptions:

- The model is 85 % of the cost and transcription is 15 %; retries would be counted but none occurred.
- About 2300 input tokens per run are the fixed instruction prompt, so a short recording costs more
  per audio minute than a long one — cost per operation is the honest unit, and cost per audio
  minute is reported because the brief asks for it.
- No prompt caching is used; one recording is one call.
- A new Deepgram account receives $200 of credit, which absorbed every run made for this
  assignment. That credit is not treated as zero operating cost anywhere in this document.
- Hosting is separate and excluded: the demo targets Vercel Hobby, a fixed monthly cost with no
  per-operation component.

### What this assignment actually spent

Anthropic, estimated from recorded token counts and run counts: about $2.60 in total by 2026-09-16 —
four full fixture runs (about $0.55), a nine-sample benchmark on each of two models ($0.42 and $0.24),
one tagged comparison run ($0.12), six live browser suites (about $1.05), about a dozen manual runs
in the demo (about $0.20) and small diagnostic calls. Deepgram: about
$0.11 of speech synthesis for the fixtures and under $0.05 of transcription, all inside the free
credit, and all still counted above at list price.

### Spending guard

A public demo URL spends someone's key, so the route refuses more than twelve runs per client
address per hour and two hundred per process per day, with HTTP 429 and `retry-after`
(`src/lib/limits.ts`, ADR-0022). Both limits are environment variables. The counters live in the
process, so a serverless deployment enforces them per instance: this is a floor on abuse, not an
exact ceiling.

## 6. Tradeoff measured, not asserted

`claude-sonnet-5` was run on the same three transcripts, nine samples, model as the only variable
(`reports/benchmark.claude-sonnet-5.json`):

| | `claude-opus-5` | `claude-sonnet-5` |
| --- | --- | --- |
| Passed | 9 of 9 | 8 of 9 |
| Extraction latency, median | 13.2 s | 16.3 s |
| Extraction latency, range | 9.4–36.8 s | 6.4–35.1 s |
| Cost per run, median | $0.0514 | $0.0357 |
| Cost per run, range | $0.0417–0.0677 | $0.0158–0.0599 |

Sonnet is about 30 % cheaper at the median and no faster. Its one failure cited different evidence
for the ambiguous item than the expected list demands. Opus stays the default because correctness on
the decline case is the product, and `EXTRACTION_MODEL` switches models without a code change.

## 7. AI tools and models used

| Tool | Where | What it does |
| --- | --- | --- |
| Deepgram `nova-3` | `src/lib/asr.ts` | Transcription with diarization and word timestamps. |
| `claude-opus-5` | `src/lib/extract.ts` | Reads the transcript and reports each task's final state. |
| Deepgram `aura-2` | `scripts/make-audio.ts` | Generates the fixture recordings; not part of the user flow. |
| Claude Code (Opus 5) | the repository | Wrote the implementation, the tests and these notes. |

### How model output was checked

Two independent checks, because a model grading itself proves nothing.

1. **Mechanical verification, on every request.** `src/lib/verify.ts` re-derives everything the model
   could get wrong. Each quote is matched against the transcript after normalisation and rebound to
   the word span that actually contains it; an item whose quote is not in the transcript is dropped.
   Owners are cleared unless the name was spoken. Dates are computed from an anchor date that was
   stated, never from the clock. A test asserts this directly: given a model response whose
   `anchor_date` is today's date and a transcript with no date in it, the output date is `null`.
2. **Scoring against a ground truth written first.** The expected list for each fixture was written
   from the script before the pipeline ran, and `src/lib/score.ts` fails on a missing commitment, a
   wrong owner or deadline, a wrong exclusion reason, and on any extra commitment the expected list
   does not contain.

Worked example: on the first live run the model returned "Update the release runbook before the
release" in `excluded` with reason `never_accepted`. Scoring failed with `missing commitment:
runbook`, which located a prompt defect rather than a model failure — the transcript says "Agreed,
the runbook must be updated before the release", so the task was agreed and only the owner was
undecided. After the prompt fix the item is a commitment with `owner.status = "unassigned"`.

## 8. Tests

| Layer | Count | Needs a key | What it proves |
| --- | --- | --- | --- |
| Unit | 94 | no | Quote binding, date resolution, verification rules, cost maths, event framing, spending limits, WAV assembly. |
| Integration | 44 | no | The pipeline and the API route over recorded provider output, including both variants, speaker attribution, the event order and every error path. |
| End-to-end, offline | 7 | no | The real browser path with both providers stubbed, including segment playback and the bundled samples. |
| End-to-end, live | 5 | yes | The same path against live providers on the fixture audio. |

`npm test` runs the first two layers in about a second. `npm run test:e2e:offline` runs the browser
layer with no key. `npm run test:e2e` runs the live layer and costs about $0.20.

## 9. Reused components and own work

Reused: Next.js, React, Tailwind CSS, Zod, Vitest, Playwright, `@anthropic-ai/sdk`, Deepgram
`nova-3` and `aura-2` over their documented REST endpoints.

Written for this brief: the entire pipeline and its rules (`src/lib/*`), the extraction prompt and
schema, the scoring harness, the UI, the fixture scripts and their expected lists, and the four
command line scripts.

## 10. What I would improve next

1. Test on real recorded speech with crosstalk and accents; synthetic fixtures make diarization
   easier than it is in the field.
2. Let the user correct an item in place, since a human who disagrees with one owner currently has
   no way to say so.
3. Cache the instruction prefix, which is about 2300 fixed input tokens per call.
4. Move the spending guard to a shared counter, because the current one is per process.
5. Add a second reviewer pass over the produced list for recordings above two minutes, where a
   single pass has more room to miss a late cancellation.
