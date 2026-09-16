# ISSUE-002 — The recording date field silently overrides a date spoken in the recording

| Field | Value |
| --- | --- |
| Status | Open |
| Type | Defect |
| Severity | High |
| Priority | P1 |
| Found | 2026-09-16, manual review of the live demo |
| Found by | Andrii |
| Component | `src/lib/verify.ts`, `resolveAnchor`; specification gap in `docs/spec/SPEC.md` I5 |
| Tests that missed it | Unit and integration tests cover each source alone, never both at once |

## Summary

When the user enters a recording date and the recording also states its own date, the product uses
the user's date without comparing the two, and shows a deadline that was never agreed.

## Steps to reproduce

1. Run `npm run dev` and open `http://localhost:3000`.
2. Set **Recording date** to `2026-09-16`.
3. Click **Sample C — hedged answer**, then **Extract commitments**.
4. Read the deadline of "Set up a backup job for the staging database".

## Expected

- Deadline `2026-03-06 (by this Friday)`, because the recording opens with "today is Monday,
  03/02/2026".
- A warning that the recording date field and the date spoken in the recording disagree, naming both.

## Actual

- Deadline `2026-09-18 (by this Friday)`.
- No warning.

## Root cause

`resolveAnchor` returns the user-supplied date whenever it is present and only reads the transcript
when it is absent. The two dates are never compared. SPEC I5 says the field is "used only as an anchor
date" but does not define precedence, so the code followed the order it was written in.

## Impact

The product shows a confident calendar date that contradicts the first sentence of the recording. The
brief explicitly forbids presenting a deadline that was never agreed.

## Proposed fix

- A date spoken in the recording takes precedence, because it is evidence; the field only fills a gap.
- When both exist and differ, add a warning `anchor_date_conflict` that names both dates and says which
  one was used.
- Add the precedence rule to SPEC I5 and record the decision as an ADR.

## Acceptance criteria

- A unit test with both a spoken date and a different user date resolves deadlines from the spoken
  date, sets `anchor_date_source` to `recording`, and emits `anchor_date_conflict`.
- A unit test with equal dates emits no warning.
- A unit test with only a user date still uses it and labels it `user`.
- The UI shows the conflict warning in plain language.
