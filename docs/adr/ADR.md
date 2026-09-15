# Architecture Decision Record

Append-only log. One decision per entry. Each field is exactly one sentence.

---

## ADR-0001 — Application stack

Status: accepted (2026-09-15)
Context: The deliverable is a browser demo with server-side API calls and must be reproducible from one repository.
Decision: The application is a single Next.js 15 App Router project in TypeScript, with the UI in React Server and Client components and the pipeline in route handlers.
Consequence: One `npm run dev` command starts the whole product and one Vercel project deploys it.
Rejected: A split React SPA plus Python FastAPI backend was rejected because it doubles setup steps without adding capability.

---

## ADR-0002 — Speech recognition provider

Status: accepted (2026-09-15)
Context: The output requires speaker attribution and millisecond timestamps for every quote.
Decision: Speech recognition uses Deepgram `nova-3` pre-recorded transcription with `diarize=true`, `utterances=true`, `punctuate=true` and `smart_format=true`.
Consequence: Diarization, word timestamps and utterance segmentation arrive in one request and one billed unit.
Rejected: OpenAI `whisper-1` was rejected because it returns no speaker labels, and local `faster-whisper` plus `pyannote` was rejected because it adds a Python runtime and GPU dependency.

---

## ADR-0003 — Reasoning model

Status: accepted (2026-09-15)
Context: Commitment extraction requires tracking acceptance, cancellation and correction across the whole transcript.
Decision: Extraction calls the Anthropic Messages API with model `claude-opus-5`, adaptive thinking and a single strict tool that returns the output document.
Consequence: The response is schema-validated JSON and the cost is measured from reported token usage.
Rejected: A cheaper model was not selected by default because the assessment weights correctness above cost, and the model id is configurable through `EXTRACTION_MODEL`.

---

## ADR-0004 — Output validation

Status: accepted (2026-09-15)
Context: Model output must not reach the UI in a shape the UI cannot render.
Decision: The tool schema is declared once in Zod and converted to JSON Schema, and every model response is parsed by that Zod schema before further processing.
Consequence: A malformed response fails at the boundary with a logged reason instead of producing a partial render.
Rejected: Hand-written JSON Schema plus manual type definitions were rejected because the two copies drift.

---

## ADR-0005 — Evidence binding

Status: accepted (2026-09-15)
Context: Rule R7 requires every emitted item to be traceable to real spoken text.
Decision: Verification matches each quote against the transcript after lowercasing and whitespace collapsing, and rebinds `start_ms` and `end_ms` to the matched utterance span.
Consequence: Timestamps in the UI always point at audio that contains the quoted words, and unmatched items are dropped with a warning.
Rejected: Trusting model-reported timestamps was rejected because the model has no access to the audio clock.

---

## ADR-0006 — Relative date handling

Status: accepted (2026-09-15)
Context: The brief forbids inferring a date that was never agreed.
Decision: A relative deadline is converted to a calendar date only when an absolute anchor date appears in the transcript or is supplied explicitly by the user, and the system clock is never used as an anchor.
Consequence: Recordings without an anchor return `unresolved_relative` deadlines and a `missing_date_context` warning instead of a guessed date.
Rejected: Using upload time as the anchor was rejected because it silently fabricates agreement context.

---

## ADR-0007 — Persistence

Status: accepted (2026-09-15)
Context: The demo needs the audio available for segment playback but has no multi-user or retention requirement.
Decision: The uploaded file is held in a server-side in-process store keyed by run id and is also kept as an object URL in the browser for playback.
Consequence: No database is required and a server restart clears all runs.
Rejected: Object storage and a database were rejected as scope outside the eight-hour window.

---

## ADR-0008 — Test recording production

Status: accepted (2026-09-15)
Context: The test set must be shareable, reproducible and available in two variants that differ by one agreement.
Decision: Fixture audio is generated from a checked-in script by Deepgram Aura-2 text-to-speech using one voice per speaker, with segments concatenated as described in ADR-0013.
Consequence: Regenerating a variant is a script run and the scripts document the ground truth verbatim.
Rejected: Human recording was rejected because it is not reproducible and cannot be regenerated after a script edit.

---

## ADR-0009 — Test strategy

Status: accepted (2026-09-15)
Context: Tests must cover pure logic, wired-up stages and the real browser flow without making every run billable and non-deterministic.
Decision: The suite has three layers — unit tests over pure functions, integration tests that drive the pipeline and the API route with recorded provider responses, and end-to-end tests that drive the browser against live providers — run by `npm run test:unit`, `npm run test:integration` and `npm run test:e2e`.
Consequence: Unit and integration layers run offline in CI on every change, and the end-to-end layer is run deliberately with `RUN_E2E=1` and real API keys.
Rejected: Making all tests depend on live APIs was rejected because it makes failures non-deterministic and billable, and mocking only at the HTTP boundary was rejected because it would leave the route handler untested.

---

## ADR-0016 — End-to-end test driver

Status: accepted (2026-09-15)
Context: Acceptance criterion A8 requires proof that an evidence quote plays the matching audio segment in a real browser.
Decision: End-to-end tests use Playwright against `next start`, upload the fixture audio through the real file input and assert on rendered commitments and on `currentTime` of the audio element after activating an evidence control.
Consequence: The browser demo itself is the tested artefact and the same run produces the measured latency and cost reported in the delivery notes.
Rejected: Asserting the pipeline only through the API route was rejected because it cannot prove playback behaviour.

---

## ADR-0010 — Cost and latency measurement

Status: accepted (2026-09-15)
Context: The brief requires reported measurements rather than promised targets.
Decision: Each stage records wall-clock milliseconds and provider usage counters, and all unit prices live in `src/config/pricing.ts` with a source comment per price.
Consequence: `metrics.cost_per_audio_minute_usd` is computed from the current run only and the pricing assumptions are auditable in one file.
Rejected: Estimating cost from audio duration alone was rejected because it hides token-driven variance and retries.

---

## ADR-0011 — Language

Status: accepted (2026-09-15)
Context: The brief limits scope to one language and the chosen providers give best diarization and TTS quality in English.
Decision: The supported language is English and the UI states this limit.
Consequence: Non-English input is out of contract and is not tested.
Rejected: Ukrainian was rejected because the selected TTS voice set does not cover it, which would break the reproducible fixture pipeline.

---

## ADR-0012 — Clarification behaviour

Status: accepted (2026-09-15)
Context: The brief requires an input on which the product asks for clarification or declines to conclude.
Decision: A task with a hedged acceptance is emitted in `excluded` with reason `ambiguous` and is paired with an `open_questions` entry naming the undecided point.
Consequence: The product never converts an unresolved discussion into a task, and the user sees both that the item exists and what has to be decided.
Rejected: Emitting a low-confidence commitment with a confidence score was rejected because the brief requires final state, not probability.

---

## ADR-0013 — Audio assembly

Status: accepted (2026-09-15)
Context: `ffmpeg` is not installed on the development machine and adding it would make fixture generation depend on a system binary.
Decision: Text-to-speech requests ask Deepgram for 24 kHz 16-bit mono WAV, and the generator concatenates segments by parsing and rewriting the WAV header in Node with no external binary.
Consequence: Fixture generation runs with `npx tsx` alone and produces byte-identical audio for an unchanged script.
Rejected: `ffmpeg` concatenation was rejected because it adds an install step to the reproduction instructions.

---

## ADR-0014 — Provider transport

Status: accepted (2026-09-15)
Context: Two providers are called from server code and each adds install size and its own abstraction.
Decision: Anthropic is called through the official `@anthropic-ai/sdk`, and Deepgram transcription and speech are called with `fetch` against their documented REST endpoints.
Consequence: The Deepgram request parameters are visible in the source and reproducible with `curl`, while Anthropic tool use, retries and typed errors come from the maintained SDK.
Rejected: Adding `@deepgram/sdk` was rejected because the two endpoints used are single POST requests.

---

## ADR-0015 — Audio duration source

Status: accepted (2026-09-15)
Context: The 180-second limit must be enforced before a paid transcription request is made and the exact duration is needed for cost maths.
Decision: The browser measures duration with an `HTMLAudioElement` before upload and the server re-checks the duration reported by Deepgram in `metadata.duration` after transcription.
Consequence: Oversized recordings are rejected without a provider call, and reported cost always uses the provider's own duration.
Rejected: Server-side probing with `ffprobe` was rejected for the reason given in ADR-0013.

---

## ADR-0017 — Offline browser layer

Status: accepted (2026-09-15)
Context: The browser path had to be provable before any provider key existed, and every live run costs money.
Decision: `STUB_PROVIDERS=1` makes the server read a recorded transcript and a recorded model response for the uploaded fixture instead of calling the providers, and that flag is set only by `npm run test:e2e:offline`.
Consequence: Upload, route handling, verification, rendering and segment playback are tested in a real browser on every change, and the live end-to-end suite stays a deliberate, billable run.
Rejected: Intercepting provider HTTP inside the browser was rejected because the calls happen on the server, and shipping the flag enabled was rejected because the product must process real input.

---

## ADR-0018 — Provider survey

Status: accepted (2026-09-15)
Context: ADR-0002 and ADR-0008 picked Deepgram from the keys that were available, without comparing the market.
Decision: Deepgram is kept for both transcription and fixture speech because it is the cheapest batch provider that returns diarization and word timestamps in one call ($0.0043 per audio minute), and because a new account receives $200 of credit that covers this assignment many times over.
Consequence: AssemblyAI stays the documented swap if diarization accuracy on real, noisy audio ever becomes the binding constraint, and the swap is confined to `src/lib/asr.ts` because transcription sits behind the `AsrProvider` interface.
Rejected: ElevenLabs Scribe and Google Chirp were rejected on price and on subscription-shaped billing, OpenAI `gpt-4o-transcribe` was rejected because it returns no speaker labels, and local WhisperX with pyannote was rejected because it adds a Python and GPU dependency to a repository that currently needs only Node.

---

## ADR-0019 — Fixture speech provider

Status: accepted (2026-09-15)
Context: Free open-weight speech synthesis (Kokoro, Piper, edge-tts) would remove the only paid step that is not part of the user flow.
Decision: Fixture audio keeps Deepgram Aura-2 because the three scripts cost about $0.12 of list price in total, and a local model would add a Python or ONNX runtime to the one command that regenerates the test set.
Consequence: Regenerating the whole test set stays `npm run fixtures:audio` with no system dependency, and the cost is reported at list price even though the free credit absorbs it.
Rejected: Kokoro was the strongest free alternative and is the fallback if the test set ever has to be regenerated without a Deepgram account.

---

## ADR-0020 — Written date form from speech recognition

Status: accepted (2026-09-15)
Context: The first live run showed that `smart_format` rewrites "March second, twenty twenty six" into `03/02/2026`, which the anchor date parser did not read, so a resolvable deadline was reported as unresolved.
Decision: The anchor date parser accepts the US written order month/day/year for slash and dot separated dates, because the product is English-only and Deepgram normalises to that order.
Consequence: A date spoken in an English recording resolves whether the provider returns words or digits, and a first component above twelve is rejected instead of being reinterpreted.
Rejected: Turning `smart_format` off was rejected because it also removes the punctuation that makes quotes readable, and guessing day/month order from context was rejected because it invents a fact the recording did not state.

---

## ADR-0021 — Progressive results

Status: accepted (2026-09-15)
Context: A run takes fourteen to nineteen seconds and the user saw nothing but a timer until all of it finished, although the transcript exists after about four.
Decision: `POST /api/process` returns newline-delimited JSON events — `stage`, `transcript`, `document` or `error` — and the browser renders the transcript the moment it arrives.
Consequence: The first useful output appears in about a quarter of the total time, and a failure after the stream opens is delivered as an `error` event that carries the HTTP status it would otherwise have had.
Rejected: Server-sent events were rejected because the payload is one-way and already framed by lines, and a second non-streaming endpoint was rejected because two code paths for one pipeline drift apart.

---

## ADR-0022 — Spending guard on the public demo

Status: accepted (2026-09-15)
Context: One run costs about five cents of provider credit, so a public demo URL is an open wallet against a finite key balance.
Decision: The route refuses a run with HTTP 429 and a `retry-after` header beyond twelve runs per client address per hour or two hundred runs per process per day, both overridable by environment variable.
Consequence: A shared demo link cannot drain the key faster than its operator intends, and the limits are visible in `src/lib/limits.ts` rather than hidden in a provider dashboard.
Rejected: A durable counter in Redis or a database was rejected as scope, which means a serverless deployment enforces these limits per instance and the daily cap is a floor rather than an exact ceiling.

---

## ADR-0023 — Audio format and upload limit

Status: accepted (2026-09-15)
Context: A check against the deployment target found that its request body limit is 4.5 MB and cannot be raised from configuration, while the WAV recordings were 5.2 MB, so the deployed demo would have failed on its own samples with HTTP 413.
Decision: Recordings are distributed and uploaded as 48 kbps mono MP3, encoded from the assembled WAV by `@breezystack/lamejs`, and the product rejects any upload above 4.5 MB in the browser before the request is made.
Consequence: A three minute recording is about 1.1 MB instead of 8.6 MB, transcription latency fell from 3.5-6.9 s to 1.4-2.1 s because the upload is eight times smaller, and the repository carries 1.5 MB of audio instead of 12 MB.
Rejected: A lower WAV sample rate was rejected because three minutes still exceeds the limit, and uploading to object storage first was rejected as scope that does not change the product's answer.
