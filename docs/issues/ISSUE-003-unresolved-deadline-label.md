# ISSUE-003 — An unresolved deadline says "no date context" when a date is known

| Field | Value |
| --- | --- |
| Status | Open |
| Type | Defect |
| Severity | Low |
| Priority | P3 |
| Found | 2026-09-16, manual review of the live demo |
| Found by | Andrii |
| Component | `src/components/Analyzer.tsx`, `Deadline` |
| Tests that missed it | The browser suite asserts the label text exists, not that it is accurate |

## Summary

Every unresolved deadline is labelled "no date context", including deadlines that stay unresolved for
a different reason while a recording date is known.

## Steps to reproduce

1. Set **Recording date** to `2026-09-16`.
2. Run **Sample A — base call**.
3. Read the deadline of "Update the release runbook before the release".
4. Run **Sample B — one agreement changed** and read the deadline of "Build the progress bar on the
   import screen".

## Expected

The label states the actual reason:

| Deadline | Reason |
| --- | --- |
| "before the release" | tied to an event, not to a calendar date |
| "by the end of next week" | expression is ambiguous, so it is not converted |
| any relative deadline with no recording date | no date context |

## Actual

Both show "— no date context", although the recording date is set.

## Root cause

The `Deadline` component receives only the deadline status. It does not know whether an anchor date
exists, so it cannot tell "no date" from "date known, expression not convertible".

## Proposed fix

Pass the anchor date to the component and choose the label from it: "no date context" when the anchor
is missing, "not converted to a date" when the anchor exists.

## Acceptance criteria

- With no recording date, an unresolved deadline reads "no date context".
- With a recording date, an unresolved deadline reads "not converted to a date".
- The offline browser suite asserts both labels.
