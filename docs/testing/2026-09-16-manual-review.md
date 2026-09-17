# Manual review session — 2026-09-16

| Field | Value |
| --- | --- |
| Tester | Andrii |
| Guide | Claude Code |
| Build | `48586aa`, `npm run dev` on localhost |
| Providers | Live: Deepgram `nova-3`, `claude-opus-5` |
| Duration | About one hour |

## Goal

Walk through the running product as a user, item by item, and check every output against the
recording rather than against the automated tests.

## Scope

| Input | Recording date field | Covered |
| --- | --- | --- |
| Sample A — base call | empty, then `2026-09-16` | metrics, warning, all three sections, playback |
| Sample B — one agreement changed | `2026-09-16` | transcript, commitments count, progress bar item |
| Sample C — hedged answer | `2026-09-16` | commitments, not commitments, open questions |

## Result against the brief

| Requirement | Result |
| --- | --- |
| Accepted task | Pass |
| Corrected deadline keeps the final value and shows the old one | Pass |
| Proposal never accepted stays out of the list | Pass |
| Cancelled task stays out of the list with its reason | Pass |
| Task with no named owner keeps the owner empty | Pass |
| Relative date without context keeps its wording | Pass |
| One changed agreement moves exactly one item | Pass |
| Hedged answer is not concluded and becomes an open question | Pass |
| Supporting segment plays from the first word of the quote | Pass |
| Quote is shown under the speaker who said it | **Fail** — #1 |
| Deadline follows the date stated in the recording | **Fail** — #2 |

## Issues opened

| ID | Severity | Summary |
| --- | --- | --- |
| [#1](https://github.com/Andrii2203/afterword/issues/1) | High | Quotes attributed to the wrong speaker when turns are merged |
| [#2](https://github.com/Andrii2203/afterword/issues/2) | High | Recording date field silently overrides the spoken date |
| [#4](https://github.com/Andrii2203/afterword/issues/4) | Medium | Quotes out of time order, role not shown |
| [#3](https://github.com/Andrii2203/afterword/issues/3) | Low | "no date context" shown when a date is known |

None of the four was caught by the automated suites. All four were found by reading the output next
to the recording.

## Observations that are not defects

| Observation | Why it matters | Follow-up |
| --- | --- | --- |
| Recognition changed "We **could** also add" to "We **can** also add" in Sample B | The brief's hardest rule depends on exactly this word; verification checks quotes against the transcript, not the audio, so a misheard word passes | Improvement: flag quotes that contain words Deepgram recognised with low confidence |
| Recognition changed "I **lead** product" to "I **led** product", and "**And** should we" to "**But** should we" | Harmless here; confirms the risk above | Same as above |
| "by the end of next week" stays as words even with a recording date | Deliberate rule D7: every "next …" expression is treated as ambiguous | Decision, not a defect; revisit if users call it unambiguous |
| A quote can be a whole five-sentence utterance | Correct, but weak as evidence | Expected to shrink after #1 splits merged turns |
| Playback can stop up to about 0.25 s late | The browser reports playback position roughly four times a second | Known limit; state it in the walkthrough |
| Time to result was 17.8 s against 13–17 s in the delivery notes | Within the measured range of 9.4–36.8 s | None; the delivery notes already report the range |

## Lesson

Automated tests checked **what** was said and **which** items were produced. No test checked **who**
said a quote or **which date source** won. Each fix for #1 and #2 adds that assertion, so
the same class of error is caught automatically next time.

## Follow-up

| ID | Outcome |
| --- | --- |
| [#1](https://github.com/Andrii2203/afterword/issues/1) | Fixed on 2026-09-16. All eight misattributed phrases found in this session are now asserted by integration tests. |
| [#2](https://github.com/Andrii2203/afterword/issues/2) | Fixed on 2026-09-17. The date spoken in the recording now wins (ADR-0025), a disagreement raises `anchor_date_conflict`, and unit, route and browser tests cover both dates at once. |
| [#4](https://github.com/Andrii2203/afterword/issues/4) | Fixed on 2026-09-17. Quotes under an item are ordered by time and each carries its role, while items still follow their deciding quote. |
| [#3](https://github.com/Andrii2203/afterword/issues/3) | Fixed on 2026-09-17. An unresolved deadline says whether the date is missing or the expression was not converted. |
| [#6](https://github.com/Andrii2203/afterword/issues/6) | Fixed on 2026-09-17. The language is detected during transcription and a non-English recording is refused before the model is called (ADR-0026). |
| [#5](https://github.com/Andrii2203/afterword/issues/5) | Done on 2026-09-17. The observation about misheard words became a check: quotes holding a low-confidence word are labelled "check this" (ADR-0027). |
