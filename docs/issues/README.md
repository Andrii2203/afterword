# Issues

One file per issue. A file is written so that someone who was not in the session can reproduce the
problem, understand its cause and know when it is fixed.

| ID | Title | Severity | Priority | Status |
| --- | --- | --- | --- | --- |
| [ISSUE-001](ISSUE-001-speaker-attribution.md) | Quotes are attributed to the wrong speaker when turns are merged | High | P1 | Open |
| [ISSUE-002](ISSUE-002-anchor-date-conflict.md) | The recording date field silently overrides a date spoken in the recording | High | P1 | Open |
| [ISSUE-004](ISSUE-004-evidence-order.md) | Quotes under an item are out of order and their role is hidden | Medium | P2 | Open |
| [ISSUE-003](ISSUE-003-unresolved-deadline-label.md) | An unresolved deadline says "no date context" when a date is known | Low | P3 | Open |

## Scales

| Severity | Meaning |
| --- | --- |
| High | The output can state something the recording contradicts. |
| Medium | The output is correct but a user is likely to misread it. |
| Low | Wording or presentation is imprecise; nothing is misread. |

| Priority | Meaning |
| --- | --- |
| P1 | Fix before submission. |
| P2 | Fix before submission if time allows. |
| P3 | Fix when convenient. |

## Lifecycle

`Open` → `In progress` → `Fixed` (code merged, acceptance criteria met) → `Verified` (checked again in
the running product). A fixed issue keeps its file; the status and a link to the commit are added.

## Moving to GitHub

When the repository has a GitHub remote, each file becomes an issue:

```bash
gh issue create --title "Quotes are attributed to the wrong speaker when turns are merged" --body-file docs/issues/ISSUE-001-speaker-attribution.md --label bug
```
