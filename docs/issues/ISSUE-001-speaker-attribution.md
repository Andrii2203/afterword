# ISSUE-001 — Quotes are attributed to the wrong speaker when turns are merged

| Field | Value |
| --- | --- |
| Status | Open |
| Type | Defect |
| Severity | High |
| Priority | P1 |
| Found | 2026-09-16, manual review of the live demo |
| Found by | Andrii |
| Component | `src/lib/asr.ts`, `mapDeepgramResponse` |
| Tests that missed it | All layers: no test asserts who said a quote |

## Summary

When two speakers talk with a short pause between turns, the product shows a quote under the wrong
speaker's name.

## Steps to reproduce

1. Run `npm run dev` and open `http://localhost:3000`.
2. Click **Sample A — base call**, then **Extract commitments**.
3. In **Not commitments**, read the evidence under "Add a progress bar to the import screen".

## Expected

`0:52 Daniel Okafor: "We could, but I don't want to commit to that today."`

## Actual

`0:52 Maya Chen: "We could, but I don't want to commit to that today."`

## Evidence

The same fault appears in all three samples.

| Sample | Where | Words said by | Shown as |
| --- | --- | --- | --- |
| A | Not commitments, progress bar, 0:52 | Daniel | Maya |
| A | Open questions, 1:36, "I don't know. I have not asked them." | Maya | Daniel |
| B | Transcript 0:12, "First one is the duplicate welcome email." | Maya | Daniel |
| B | Transcript 0:37, "Fair point. Let me correct that." | Maya | Daniel |
| B | Transcript 0:53, "Good. That one is yours as well." | Maya | Daniel |
| B | Transcript 1:31, "We are not deciding who does that right now." | Maya | Daniel |
| B | Transcript 1:38, "I don't know. I have not asked them." | Maya | Daniel |
| C | Open questions, 0:18, "So is that a yes?" | Maya | Daniel |

In Sample C the card contradicts itself: it says "Raised by Maya Chen" and shows the question under
"Daniel Okafor".

## Root cause

Confirmed on 2026-09-16 with a raw Deepgram request for `public/samples/meeting-a.mp3`.

- Deepgram labels the speaker of every word correctly.
- Deepgram groups words into utterances by pause length. The fixture pauses are 0.35 s, so adjacent
  turns by different speakers are merged into one utterance.
- `mapDeepgramResponse` takes the speaker from the utterance, not from its words, so every word in a
  merged utterance inherits one speaker.

Word labels from Deepgram for the passage in step 3:

```text
speaker 0  47.3 s  We could also add a progress bar to the import screen. It might reduce the drop off.
speaker 1  52.4 s  We could, but I don't want to commit to that today. Let's leave it as an idea.
speaker 0  57.9 s  Fine. It stays an idea. Nobody is picking it up.
```

## Impact

- Every quote in a merged utterance can show the wrong speaker.
- The model reads the transcript with the wrong labels, so an "I'll do it" inside a merged utterance
  can produce the wrong owner. This did not happen in the samples, but nothing prevents it.

## Proposed fix

Split each Deepgram utterance into a new utterance wherever the word-level speaker changes, and take
the utterance speaker from its words.

## Acceptance criteria

- A unit test feeds `mapDeepgramResponse` one utterance whose words change speaker, and gets two
  utterances with the correct speakers and time spans.
- An integration test asserts that the quote "I don't want to commit to that today" is attributed to
  Daniel Okafor in `meeting-a`.
- The recorded runs in `fixtures/*.asr.json` and `fixtures/*.llm.json` are regenerated with
  `npm run fixtures:run`, and all three fixtures still pass.
- The live browser suite passes.

## Notes

- Regenerating the recorded runs is required, not optional: some recorded quotes span two turns that
  will become separate utterances, and a quote may not span utterances, so the old recordings would
  fail verification.
- `docs/DELIVERY.md` numbers change after regeneration and must be updated.
