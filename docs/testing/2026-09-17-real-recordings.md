# Real recordings session — 2026-09-17

| Field | Value |
| --- | --- |
| Tester | Claude Code, reviewed by Andrii |
| Build | `8b54876` |
| Providers | Live: Deepgram `nova-3`, `claude-opus-5` |
| Runs | 5 live runs, $0.2972 in total |

## Goal

Every measurement so far came from three fixtures spoken by a synthesiser from a script we wrote.
That corpus cannot show what the product does with real speech: overlapping turns, fillers, accents,
people who never introduce themselves. This session feeds it recordings it has never seen.

## Material

Openly licensed recordings, downloaded and cut locally to 175 s so they fit the duration and upload
limits. Clip windows for the meetings were chosen from the corpus's own manual annotations, so each
one covers spans that human annotators marked as decisions.

| Clip | Source | Licence | Window | Speakers |
| --- | --- | --- | --- | --- |
| `ami-es2002a` | AMI Meeting Corpus ES2002a | CC BY 4.0 | 300–475 s | 3 heard |
| `es2002d-decisions` | AMI Meeting Corpus ES2002d | CC BY 4.0 | 400–575 s | 2 heard |
| `is1000a-decisions` | AMI Meeting Corpus IS1000a | CC BY 4.0 | 1040–1215 s | 3 heard |
| `faif-0x6c` | Free as in Freedom 0x6C | CC BY-SA 4.0 | middle three minutes | 2 |
| `faif-tail` | Free as in Freedom 0x6C | CC BY-SA 4.0 | closing three minutes | 2 |

## What held

| Behaviour | Evidence |
| --- | --- |
| No invented commitments on a conversation that agrees nothing | The ES2002a icebreaker and the middle of the podcast both produced an empty document |
| Advice to an audience is not a commitment | "you can file neutral comments by March 10" was excluded as `never_accepted` |
| Language detection does not misfire on real English | None of the five runs was refused |
| Quotes stay verbatim and playable | Every emitted quote was located in the transcript |

## What broke

| ID | Severity | Finding |
| --- | --- | --- |
| [#7](https://github.com/Andrii2203/afterword/issues/7) | High | A misheard word became a speaker's name and was attached to the wrong speaker: `Mile.`, spoken by label `0` in IS1000a, became the name of label `1` |
| [#8](https://github.com/Andrii2203/afterword/issues/8) | High | The uncertainty thresholds, read off synthetic audio, marked 7 of 8, 6 of 6 and 2 of 3 quotes on real clips |
| [#9](https://github.com/Andrii2203/afterword/issues/9) | Medium | Nobody introduces themselves in a real meeting, so every owner came out empty |
| [#10](https://github.com/Andrii2203/afterword/issues/10) | Medium | Three spans the corpus annotators recorded as decisions were reported as `never_accepted`, because they set constraints rather than accept tasks |
| [#11](https://github.com/Andrii2203/afterword/issues/11) | Medium | Speed and cost in the delivery notes were measured on fixtures only and roughly double on real audio |

## Fixed in this session

#7, #8 and #11 are fixed; the same recordings were re-verified offline against the new rules.

| Measure | Before | After |
| --- | --- | --- |
| IS1000a speaker names | `1=Mile` | none, with `speaker_name_unverified` |
| Podcast speaker names | `Karen`, `Bradley` | unchanged, now bound through the address rule |
| ES2002d quotes marked uncertain | 7 of 8 | 4 of 8 |
| IS1000a quotes marked uncertain | 6 of 6 | 2 of 6 |
| Fixture quotes marked uncertain | 3 recognition, 3 speaker | unchanged |

The decisions behind the fixes are ADR-0028 (confidence limits belong to the recording) and ADR-0029
(a name is bound by its introduction or by an address in a two-speaker recording).

#9 is partly addressed: a name spoken as an address now binds to the other speaker when there are
exactly two. The gap does not depend on head count: ES2002d has two voices and no name is ever said,
so its owners stay empty. The proposed fix is to keep the voice that accepted a task as its owner,
shown as an unnamed speaker, and it is recorded on the issue. #10 remains open as a scope question:
the product lists accepted tasks, and an agreed constraint is neither a task nor a denial.

## Lesson

A synthetic corpus tests the rules; only real audio tests the thresholds. Both thresholds chosen in
the previous session were wrong by a factor that no fixture could reveal, because the fixtures have no
tail: their tenth percentile of word confidence is 0.99 against 0.67–0.80 on real speech.
