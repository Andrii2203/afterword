# ISSUE-004 — Quotes under an item are out of order and their role is hidden

| Field | Value |
| --- | --- |
| Status | Open |
| Type | Defect |
| Severity | Medium |
| Priority | P2 |
| Found | 2026-09-16, manual review of the live demo |
| Found by | Andrii |
| Component | `src/lib/verify.ts`, `mapEvidence`; `src/components/Analyzer.tsx`, `Evidences` |
| Tests that missed it | No test asserts the order of evidence within an item |

## Summary

The quotes under one item appear in the order the model returned them, not in time order, and nothing
on screen says which quote decides the item. A user reads it as a glitch.

## Steps to reproduce

1. Run **Sample C — hedged answer**.
2. Read the evidence under "Set up a backup job for the staging database".

## Expected

Quotes in time order, each marked with its role:

```text
0:27  context     "the staging database has no backup job"
0:30  acceptance  "I'll set that up by this Friday."
0:32  acceptance  "Good. That one is clear."
```

## Actual

```text
0:30  "I'll set that up by this Friday."
0:32  "Good. That one is clear."
0:27  "the staging database has no backup job"
```

## Root cause

- The prompt asks the model to put the deciding quote first, so the model orders by importance.
- `verify` keeps that order.
- Every quote carries a `kind` (`acceptance`, `correction`, `cancellation`, `owner`, `deadline`,
  `mention`), but the UI never displays it.

## Proposed fix

- Sort evidence within an item by `start_ms` in `verify`.
- Show a short role label next to each quote.
- Keep ordering items in the list by their deciding quote, which is unaffected.

## Acceptance criteria

- A unit test gives `verify` evidence out of time order and receives it in time order.
- The browser shows a role label on every quote.
