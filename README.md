# Afterword

Upload a recorded project discussion and get the tasks as they stood when the recording ended:
owner, deadline, open questions, and a playable timestamped quote behind every line.

The product answers one question: what was actually agreed? A proposal that was never accepted
stays a proposal, a cancelled task stays cancelled, a corrected deadline keeps its corrected value,
and an owner that was never named stays empty.

## Scope

- One language: English.
- Two speakers who introduce themselves by name.
- Audio up to 180 seconds and 4.5 MB; a three minute MP3 is about 1.1 MB, a three minute WAV is not accepted.
- No calendar integration, no task delivery to any system, no accounts.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Node 20.19+ or 24+ is required. No system binaries are needed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | yes | Transcription with diarization, and fixture text to speech. |
| `ANTHROPIC_API_KEY` | yes | Commitment extraction. |
| `EXTRACTION_MODEL` | no | Overrides the extraction model, default `claude-opus-5`. |
| `RUN_E2E` | no | Set to `1` to let the end-to-end suite spend money on live providers. |

## How it works

```text
audio ──▶ Deepgram nova-3 ──▶ diarized utterances with word timestamps
                                        │
                                        ▼
                          claude-opus-5 structured output
                          (titles, acceptance, cancellation,
                           corrections, owners, raw deadlines)
                                        │
                                        ▼
                    verification in code (src/lib/verify.ts)
        quotes re-matched against the transcript, timestamps taken from
        the audio, owners limited to names spoken, dates resolved only
        from an anchor date that was actually stated
                                        │
                                        ▼
                    commitments · not commitments · open questions
                          each with a playable audio segment
```

The model never supplies a timestamp and never supplies a date. It reports what was said and which
utterance said it; every position, name and date in the output is re-derived from the transcript.

`POST /api/process` takes `multipart/form-data` with a `file` field and an optional
`anchor_date`, and answers with newline-delimited JSON: a `stage` event per stage, a `transcript`
event as soon as transcription finishes, and a final `document` or `error` event. The transcript
lands in about four seconds, the commitments list in about fifteen. Rejections before the stream
opens keep their HTTP status; a failure after it opens arrives as an `error` event carrying one.
The demo also caps runs per client address per hour and per process per day, because an open URL
spends a real key.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the demo locally. |
| `npm test` | Unit and integration layers, no network, no keys. |
| `npm run test:unit` | Pure functions only. |
| `npm run test:integration` | Pipeline and API route with recorded provider responses. |
| `npm run test:e2e:offline` | Real browser, both providers stubbed; no API key needed. |
| `npm run test:e2e` | Real browser, real providers; needs `RUN_E2E=1` and both keys. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm run fixtures:transcripts` | Rebuild the deterministic transcripts used by offline tests. |
| `npm run fixtures:audio` | Regenerate fixture audio from the scripts with Deepgram Aura-2. |
| `npm run fixtures:run` | Run the real pipeline over the fixture audio and score it. |
| `npm run fixtures:rescore` | Score the recorded runs again, without calling a provider. |
| `npm run check:keys` | Verify both provider keys with the smallest possible call. |
| `npx tsx scripts/benchmark.ts --repeat=3` | Repeat the extraction stage to measure its spread. |

## Deploying the demo

The application is one Next.js project with two server-side secrets and no database.

```bash
npx vercel            # link the project, first deploy goes to a preview URL
npx vercel env add DEEPGRAM_API_KEY production
npx vercel env add ANTHROPIC_API_KEY production
npx vercel --prod
```

The three sample recordings are served from `public/samples`, so the deployed demo can be tried
without uploading anything. `maxDuration` on the route is 120 seconds, which covers the measured
worst case of 19 seconds with a wide margin.

## Test set

`fixtures/` holds three conversations. Each one has a `*.script.json` source, the audio generated
from it in `public/samples/<id>.mp3`, the recorded transcript and model response, and an
`*.expected.json` ground truth that was written before the pipeline was ever run against it.

| Fixture | Contains |
| --- | --- |
| `meeting-a` | An accepted task, a corrected deadline, a never-accepted proposal, a cancelled task, a task with no owner, an unanswered question, and no spoken date. |
| `meeting-b` | `meeting-a` with exactly one agreement changed: the proposal is accepted. |
| `meeting-c` | A hedged acceptance the product must refuse to conclude, plus a spoken date that makes one relative deadline resolvable. |

Scoring reports inclusion recall, exclusion precision and per-field accuracy, and fails on any
commitment the expected list does not contain.

## Documents

- `docs/spec/SPEC.md` — the contract: input, output, decision rules, acceptance criteria.
- `docs/adr/ADR.md` — every architectural decision with its rejected alternative.
- `docs/DELIVERY.md` — measured speed and cost, what failed, what was reused, what is next.
- `docs/VIDEO.md` — the three minute walkthrough script.
- `reports/` — every recorded run behind the numbers in the delivery notes.
- `src/config/pricing.ts` — every unit price with its source and the date it was checked.

## Reused components

Next.js, React, Tailwind CSS, Zod, Vitest, Playwright, the Anthropic TypeScript SDK, Deepgram
`nova-3` and `aura-2` over HTTP. Everything in `src/lib` and `src/components` is written for this
brief.
