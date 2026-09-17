# SPEC — Recorded conversation to final commitments

Status: draft-1. Source brief: the assignment email, kept outside the repository. Every statement below is testable.

## 1. Purpose

The product converts one recorded project discussion into a list of commitments whose state matches the end of the recording.

## 2. Scope

S1. Input is one audio file, one language (English), two speakers, duration up to 180 seconds.
S2. Both speakers introduce themselves by name inside the recording.
S3. Output is a commitments list with owners, deadlines, unresolved questions and timestamped evidence.
S4. Overlapping speech is not required to be handled.

## 3. Non-goals

N1. Calendar integration is out of scope.
N2. Sending tasks to any person or system is out of scope.
N3. User accounts, payments and native app-store release are out of scope.
N4. Multi-language input is out of scope.

## 4. Glossary

G1. Utterance — a contiguous speech segment of one speaker with `start_ms`, `end_ms` and text produced by ASR.
G2. Task — an action described in the recording that someone could perform.
G3. Acceptance — an utterance in which the prospective owner, or the other speaker on behalf of the owner, explicitly states that the task will be done.
G4. Commitment — a task that has at least one acceptance utterance and no later cancellation utterance.
G5. Proposal — a task that has no acceptance utterance.
G6. Cancellation — an utterance stating explicitly that a previously accepted task will not be done.
G7. Correction — a later utterance that replaces a previously stated value of a task field.
G8. Open question — a question asked in the recording that receives no explicit answer before the recording ends.
G9. Evidence — one quote copied verbatim from the transcript together with its speaker, `start_ms` and `end_ms`.
G10. Anchor date — an absolute calendar date spoken inside the recording.

## 5. Input contract

I1. Accepted container formats are `mp3`, `m4a`, `ogg`, `webm` and `wav`, and a compressed format is required for a recording near the duration limit.
I2. Maximum upload size is 4.5 MB, which is the request body limit of the deployment target, and the browser rejects a larger file before sending it.
I3. Maximum accepted duration is 180 seconds and longer input is rejected with an explicit error.
I4. The audio file is the only required input.
I5. The user may optionally supply the recording date, which is used only as an anchor date and only when the recording states no date of its own.
I6. A date spoken in the recording takes precedence over the supplied recording date, and a disagreement between the two is reported rather than resolved silently.
I7. The recording must be in English. Its language is detected during transcription, and a recording detected as another language is refused with HTTP 422 and an error naming that language, before any extraction is paid for.

## 6. Output contract

O1. The API returns one JSON document with the keys `meta`, `speakers`, `commitments`, `excluded`, `open_questions`, `metrics` and `warnings`.
O2. `speakers[]` is `{ label, name | null, evidence }` where `name` comes from a self-introduction utterance.
O3. `commitments[]` is `{ id, title, owner, deadline, evidence[], superseded[] }`.
O4. `owner` is `{ name: string, status: "named" }` or `{ name: null, status: "unassigned" }`.
O5. `deadline` is `{ raw: string | null, date: "YYYY-MM-DD" | null, status: "resolved" | "unresolved_relative" | "none" }`.
O6. `excluded[]` is `{ id, title, reason: "never_accepted" | "cancelled" | "ambiguous", evidence[] }`.
O7. `open_questions[]` is `{ id, question, raised_by, evidence[] }`.
O8. `superseded[]` is `{ field: "deadline" | "owner" | "title", old_value, evidence }`.
O9. `metrics` is `{ audio_seconds, asr_ms, llm_ms, total_ms, asr_cost_usd, llm_cost_usd, cost_per_audio_minute_usd, tokens }`.
O10. `warnings[]` contains one machine-readable code per detected data-quality issue.
O11. Every `evidence` entry satisfies `start_ms < end_ms <= audio_ms` and is playable in the UI.
O12. `meta` carries `anchor_date`, `anchor_date_source: "recording" | "user" | "none"` and `anchor_date_ignored`, which holds the supplied recording date when it was overruled and is `null` otherwise.
O13. The `evidence[]` of one item is ordered by `start_ms`, while items are ordered by the quote that decides them, which is the first quote the model returned for that item.

## 7. Decision rules

R1. A task is emitted as a commitment only if the transcript contains an explicit acceptance utterance for that task.
R2. A task with hypothetical modality and no acceptance utterance is emitted in `excluded` with reason `never_accepted`.
R3. A task with a later cancellation utterance is emitted in `excluded` with reason `cancelled` even if it was accepted earlier.
R4. When a field is stated more than once for the same task, the last explicitly stated value is used and every earlier value is recorded in `superseded`.
R5. `owner.status` is `unassigned` whenever no speaker is named as responsible in an evidence utterance.
R6. A relative date is converted to a calendar date only if an anchor date exists and the expression is in the resolvable set below, and otherwise `status` is `unresolved_relative` with `raw` kept verbatim.

### Resolvable relative expressions

D1. `today` resolves to the anchor date.
D2. `tomorrow` resolves to the anchor date plus one day.
D3. `the day after tomorrow` resolves to the anchor date plus two days.
D4. `in N days` resolves to the anchor date plus N days.
D5. A bare weekday and `this <weekday>` resolve to the first occurrence of that weekday strictly after the anchor date and within seven days.
D6. `end of the week` and `end of this week` resolve to the Friday of the anchor date's week, and are unresolved when the anchor date is Saturday or Sunday.
D7. Every other expression, including `next <weekday>`, `next week` and `end of next week`, is left unresolved because its meaning is not agreed between speakers.
R7. Every emitted item carries at least one evidence entry whose quote is a verbatim substring of the transcript after whitespace and case normalisation.
R8. An item that fails evidence verification is removed from the output and recorded in `warnings`.
R9. An owner name must equal a speaker name introduced in the recording or a person name spoken in the transcript.
R10. Nothing is emitted that is not supported by transcript text.
R11. If no anchor date exists, `warnings` contains `missing_date_context`.
R12. Extraction always runs on the uploaded audio and never returns a stored answer for a known file.
R13. A task whose acceptance is hedged is emitted in `excluded` with reason `ambiguous` and additionally produces an `open_questions` entry naming the undecided point.
R14. An `excluded` item with reason `ambiguous` is removed when no `open_questions` entry survives verification.
R15. The anchor date is the date spoken in the recording when there is one, and the supplied recording date only otherwise; when both exist and differ, the spoken date is used and `warnings` contains `anchor_date_conflict`.

### Warning codes

W1. `missing_date_context` — the transcript contains a relative deadline and no anchor date.
W2. `evidence_unverified` — an item was dropped because no quote matched the transcript.
W3. `owner_not_a_known_name` — an owner name was cleared because it matches no name spoken in the recording.
W4. `speaker_unnamed` — a diarization label received no name because no self-introduction was found.
W5. `llm_retry` — the extraction call was retried after an invalid response.
W6. `anchor_date_conflict` — the supplied recording date differs from the date spoken in the recording, which was used instead.

## 8. Pipeline

P1. Upload and validation produce a stored audio blob and its duration.
P2. ASR produces diarized utterances with millisecond timestamps and the detected language of the recording, which ends the run when it is not English.
P3. Speaker naming maps each diarization label to a name taken from a self-introduction utterance, or leaves it `null`.
P4. Extraction sends the numbered transcript to the LLM and receives the output document through a strict tool schema.
P5. Verification enforces R5 to R11 in code and mutates or drops items that violate them.
P6. Rendering shows commitments, excluded items and open questions, each quote carrying its role and a play control for its evidence segment.
P7. Metrics are collected per stage and returned with the document.

## 9. Acceptance criteria

A1. Given the fixture recording, when it is processed, then every commitment in the expected list appears with the same owner and deadline status. (test: `eval.inclusion`)
A2. Given the fixture recording, when it is processed, then the never-accepted proposal does not appear in `commitments`. (test: `eval.exclusion.proposal`)
A3. Given the fixture recording, when it is processed, then the cancelled task does not appear in `commitments` and appears in `excluded` with reason `cancelled`. (test: `eval.exclusion.cancelled`)
A4. Given a task whose deadline was corrected, when it is processed, then `deadline` holds the corrected value and `superseded` holds the earlier value. (test: `eval.correction`)
A5. Given a task with no named owner, when it is processed, then `owner.status` is `unassigned`. (test: `eval.unassigned`)
A6. Given a recording without an anchor date, when it is processed, then relative deadlines keep `status: "unresolved_relative"` and `warnings` contains `missing_date_context`. (test: `eval.relative_date`)
A7. Given variant B of the fixture, in which one agreement is changed, when it is processed, then the output differs from variant A exactly in the affected item. (test: `eval.variant_b`)
A8. Given an evidence quote, when the user activates it, then the audio plays from `start_ms` to `end_ms`. (test: `ui.evidence_playback`)
A9. Given an ambiguous task with no acceptance, when it is processed, then the item is reported as unresolved instead of being concluded. (test: `eval.ambiguous`)
A10. Given any processed recording, when the response is returned, then `metrics.cost_per_audio_minute_usd` is a number derived from measured usage. (test: `metrics.cost`)
A11. Given a recording that states its own date and a different supplied recording date, when it is processed, then deadlines are resolved from the spoken date, `meta.anchor_date_source` is `recording` and `warnings` contains `anchor_date_conflict`. (test: `eval.anchor_conflict`)
A12. Given a recording detected as a language other than English, when it is processed, then the run fails with HTTP 422, the message names the detected language and the extraction model is never called. (test: `pipeline.language`)
A13. Given an item whose quotes were returned out of time order, when it is processed, then its quotes are returned in time order and each is shown with its role, while the item keeps its place in the list. (test: `ui.evidence_order`)

## 10. Test layers

L1. Unit tests cover pure functions in `src/lib` and never touch the network or the filesystem.
L2. Integration tests drive the full pipeline and the `POST /api/process` route with checked-in provider responses injected through the adapter interfaces.
L3. End-to-end tests drive the built application in a real browser and exist in two runs: `test:e2e:offline` with both providers stubbed and no key, and `test:e2e` with live providers and the fixture audio.
L4. L1, L2 and the offline end-to-end run need no key, and the live end-to-end run happens only with `RUN_E2E=1` and both API keys present.
L5. Every acceptance criterion in section 9 is asserted in at least one layer, and A8 is asserted only in L3.

## 11. Test set

T1. `fixtures/meeting-a.*` is the base conversation containing a never-accepted proposal, an accepted task, a corrected deadline, a cancelled task and a task with no named owner.
T2. `fixtures/meeting-a.expected.json` is the expected commitments list, written before any run of the pipeline.
T3. `fixtures/meeting-b.*` is variant A with exactly one agreement changed.
T4. `fixtures/meeting-b.expected.json` is the expected list for variant B, written before any run.
T5. `fixtures/meeting-c.*` is a recording that contains a spoken anchor date and a hedged acceptance on which the product must decline to conclude.
T6. Scoring reports inclusion recall, exclusion precision and field accuracy per fixture.
T7. Each fixture consists of a `.script.json` source, a generated `public/samples/<id>.mp3` recording, a checked-in `.asr.json` transcript and an `.expected.json` ground truth.
T8. Every `.expected.json` is written from the script before the pipeline is run against that fixture.

## 12. Metrics and cost

M1. `asr_cost_usd` equals audio minutes multiplied by the ASR unit price recorded in `src/config/pricing.ts`.
M2. `llm_cost_usd` equals input tokens multiplied by the input price plus output tokens multiplied by the output price from the same file.
M3. `cost_per_audio_minute_usd` equals the sum of `asr_cost_usd` and `llm_cost_usd` divided by audio minutes.
M4. Hosting cost is reported separately and is never added to per-operation cost.
M5. Retries are counted and their tokens are included in `llm_cost_usd`.
