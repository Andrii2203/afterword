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
| `meeting-a` | 109.2 s | PASS | 1.00 | 1.00 |
| `meeting-b` | 105.0 s | PASS | 1.00 | 1.00 |
| `meeting-c` | 42.9 s | PASS | 1.00 | 1.00 |

`meeting-a` contains all five required cases. Actual output:

| Item | Expected | Actual |
| --- | --- | --- |
| Duplicate welcome email | commitment, Daniel Okafor, "by the end of the week" unresolved | as expected |
| Onboarding checklist copy | commitment, Maya Chen, "by Thursday", superseded "by Tuesday" | as expected |
| Release runbook | commitment, owner unassigned | as expected |
| Progress bar | excluded, `never_accepted` | as expected |
| Migration script | excluded, `cancelled` | as expected |
| Legal review of consent text | open question | as expected, plus a second open question asking who will update the runbook |
| Warnings | `missing_date_context` | as expected |

`meeting-b` is `meeting-a` with one agreement changed: the progress bar is accepted. Actual output
moves that one item from `excluded` to `commitments` with Daniel Okafor as owner and leaves the
other four items unchanged in topic, owner and deadline state.

`meeting-c` is the decline case. The hedged "let's call it a maybe" produced `excluded` with reason
`ambiguous` plus two open questions, and the spoken date 2 March 2026 resolved "by this Friday" to
`2026-03-06`.

## 3. What failed

Three defects only the live providers could expose. All three are fixed and covered by a test.

| Defect | Symptom | Fix |
| --- | --- | --- |
| Written date form | `smart_format` rewrote "March second, twenty twenty six" as `03/02/2026`, which the anchor parser did not read, so a resolvable deadline was reported as unresolved | `findAnchorDate` accepts the US written order (ADR-0020) |
| Speaker label mismatch | The model echoed the display label `speaker_0` instead of the diarization label `0`, so no name ever bound and every quote lost its speaker | `verify` resolves a claimed label against the transcript and falls back to the speaker of the quoted utterance |
| Prompt gap | An agreed task with no named owner was classified `never_accepted`, losing a real commitment | The prompt states that acceptance and ownership are independent |

Two test-side corrections, disclosed because they changed the ground truth or the assertions:

1. `meeting-c` expected one exact quote as evidence for the ambiguous item; three utterances decide
   that item equally, so the assertion now accepts any of them. Demanding one exact quote tested the
   model's phrasing preference, not correctness.
2. An integration test compared commitment titles verbatim between two independent model runs. Title
   wording is free text, so the test now compares topic, owner status and deadline status.

Known limits, not fixed:

- Diarization is trusted as given; two speakers on one channel who talk over each other are out of
  scope and untested.
- The fixture audio is synthetic speech, so real-room noise, accents and crosstalk are unmeasured.
- The three WAV fixtures add about 12 MB to the repository, because no audio encoder is available
  without a system binary.

## 4. Speed

Time to a useful result, measured in the browser from the click to the rendered list
(`reports/e2e-latency.json`):

| Fixture | Audio | Browser to result | Server total |
| --- | --- | --- | --- |
| `meeting-a` | 109.2 s | 14.7 s | 14.3 s |
| `meeting-a` (repeat) | 109.2 s | 14.6 s | 14.2 s |
| `meeting-b` | 105.0 s | 19.2 s | 18.8 s |
| `meeting-c` | 42.9 s | 13.7 s | 13.4 s |

Stage split from the recorded runs: transcription 3.5–6.9 s, extraction 9.4–36.8 s. The model is
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
| `meeting-a` | $0.00783 | $0.04362 | $0.0514 | $0.0283 |
| `meeting-b` | $0.00752 | $0.05349 | $0.0610 | $0.0349 |
| `meeting-c` | $0.00307 | $0.04027 | $0.0433 | $0.0606 |

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
| Unit | 60 | no | Quote binding, date resolution, verification rules, cost maths, WAV assembly. |
| Integration | 24 | no | The pipeline and the API route over recorded provider output, including both variants and every error path. |
| End-to-end, offline | 6 | no | The real browser path with both providers stubbed, including segment playback. |
| End-to-end, live | 5 | yes | The same path against live providers on the fixture audio. |

`npm test` runs the first two layers in under a second. `npm run test:e2e:offline` runs the browser
layer with no key. `npm run test:e2e` runs the live layer and costs about $0.20.

## 9. Reused components and own work

Reused: Next.js, React, Tailwind CSS, Zod, Vitest, Playwright, `@anthropic-ai/sdk`, Deepgram
`nova-3` and `aura-2` over their documented REST endpoints.

Written for this brief: the entire pipeline and its rules (`src/lib/*`), the extraction prompt and
schema, the scoring harness, the UI, the fixture scripts and their expected lists, and the four
command line scripts.

## 10. What I would improve next

1. Stream the stages to the browser, so the transcript appears in about four seconds instead of the
   user waiting fifteen for everything at once.
2. Test on real recorded speech with crosstalk and accents; synthetic fixtures make diarization
   easier than it is in the field.
3. Let the user correct an item in place, since a human who disagrees with one owner currently has
   no way to say so.
4. Cache the instruction prefix, which is about 2300 fixed input tokens per call.
5. Add a second reviewer pass over the produced list for recordings above two minutes, where a
   single pass has more room to miss a late cancellation.
