# Video walkthrough script — 3 minutes

Record the deployed demo in the browser at 1280x800 with your voice. Times are cumulative and the
whole take is 180 seconds. Say the lines in your own words; the facts in them are what matters.

## Before you press record

- Open the deployed URL and run **Sample A** once as a warm-up. The first run after a deploy starts a
  cold function and is slower than a real one.
- Reload the page so nothing is on screen.
- The demo allows 12 runs per address per hour. The take uses 3, so two rehearsals and a take fit;
  more than that, raise `RUNS_PER_CLIENT_PER_HOUR` in the Vercel project settings first.
- Every run is live and costs about five cents. Do not cut the waiting: the timer is the evidence.

---

**0:00 – 0:15 — What it is**

> "This turns a recorded project discussion into the tasks as they stood when the recording ended. Not
> a summary: a commitments list, where every line carries the quote that proves it."

Show the header and the scope line.

---

**0:15 – 0:40 — One run, live**

Click **Sample A — base call**, then **Extract commitments**.

> "This is a call of a hundred and six seconds, processed right now."

When the transcript appears after a few seconds:

> "The transcript comes first, while the model is still reading."

When the result appears, read the timer and the counts from the screen:

> "About fifteen seconds. Three commitments, two things that are not commitments, one open question."

---

**0:40 – 1:20 — The hard part**

1. **Cancelled.** "Write a migration script", labelled `cancelled`. Click its quote; it plays.
   > "This was agreed and then dropped later in the call. It is out of the list, with the quote that
   > cancels it."
2. **Never accepted.** "Add a progress bar", labelled `never_accepted`.
   > "'We could' never became 'we will', so it stays out."
3. **Corrected.** "Rewrite the onboarding checklist copy".
   > "Tuesday was corrected to Thursday. The task holds Thursday, and the old value is kept with its
   > own quote."
4. **No owner.** "Update the release runbook".
   > "Everyone agreed it must happen and nobody took it. The owner stays empty instead of guessed."
5. **Evidence.** Point at the quotes under any item.
   > "Quotes are in time order and each says its role: acceptance, correction, context. Timestamps
   > come from the audio, not from the model."

---

**1:20 – 1:40 — Change one agreement**

Click **Sample B — one agreement changed**, then **Extract commitments**.

> "Same call, one line different: the progress bar is accepted this time. It moves into the list with
> an owner, and nothing else changes."

---

**1:40 – 2:10 — When it should not conclude**

Before running, type a wrong date such as today into **Recording date**. Then click
**Sample C — hedged answer** and **Extract commitments**.

> "Here the answer is 'let's call it a maybe'. That is neither yes nor no, so it is reported as
> ambiguous, with open questions naming what is undecided."

Point at the deadline `2026-03-06` and at the amber warning:

> "I typed a wrong date on purpose. The recording says its own date, so 'by this Friday' resolves from
> the recording, and the product tells me the two dates disagree instead of quietly picking one."

Point at a **check this** label:

> "And this quote holds a word the recogniser was unsure of, so it asks me to listen before trusting it."

---

**2:10 – 2:40 — Tested on real speech, not just my test files**

> "The three samples are synthetic. So I also ran real recorded meetings from the AMI corpus and an
> open-licensed podcast. That found five problems no test file could: for example a misheard word
> became a speaker's name, and my confidence thresholds flagged almost every real quote. Four are
> fixed and re-checked on the same recordings. One is open on purpose: an agreed rule like 'the price
> is twenty-five euros' is not a task, and deciding how to show decisions is a product question."

Optionally show the issue list on GitHub for two seconds.

---

**2:40 – 3:00 — Speed, cost, next**

> "Measured, not promised: on the samples about ten to fifteen seconds and four to seven cents a run;
> on real meetings eighteen to forty-three seconds and six to nine cents, because the model writes
> more. The model is most of the cost. Next I would add a decisions section and let a person correct
> an item in place."
