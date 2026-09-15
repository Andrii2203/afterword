# Video walkthrough script — 3 minutes

Record the browser at 1280x800 with audio. Have the demo open, network working, and nothing
uploaded yet. Times are cumulative; the whole take is 180 seconds.

---

**0:00 – 0:20 — What it is**

> "This turns a recorded project discussion into the tasks as they stood when the recording ended.
> Not a meeting summary: a commitments list. The scope is deliberate — English, two speakers who
> introduce themselves, up to three minutes."

Show the page header and the scope line under it.

---

**0:20 – 0:50 — One run, start to finish**

Click **Sample A — base call**, then **Extract commitments**. Let the timer run; do not cut.

> "This is a 109 second call. Everything you are about to see was produced from the audio just now,
> not prepared in advance."

When the transcript appears, about four seconds in, point at it:

> "The transcript arrives first, while the model is still reading. You are not staring at a spinner."

When the list appears:

> "Fourteen seconds in total. Three commitments, two items that are not commitments, one open
> question."

---

**0:50 – 1:35 — The part that is hard**

Point at each, in this order:

1. **Cancelled task.** Scroll to "Write a migration script", labelled `cancelled`.
   > "This was agreed earlier in the call and then dropped. A summariser keeps it as a task. Here it
   > is out of the list, with the reason, and the quote that cancels it."
   Click its quote — the audio plays "Cancel it. Operations migrated those accounts manually".

2. **Never accepted.** "Add a progress bar", labelled `never_accepted`.
   > "'We could' never became 'we will'. It stays out."

3. **Corrected deadline.** The checklist item.
   > "Tuesday was corrected to Thursday. The commitment holds Thursday, and the superseded value is
   > kept underneath with its own quote."

4. **No owner.** The runbook item.
   > "Both speakers agreed this has to happen and neither took it. The owner stays empty. The product
   > does not guess that the person who spoke last owns it."

5. **Warning bar.**
   > "No calendar date was spoken in this call, so 'by the end of the week' stays as words, and the
   > product says why instead of inventing a date."

---

**1:35 – 2:05 — Change one agreement**

Click **Sample B — one agreement changed**, then **Extract commitments**.

> "Same call, one line different: this time the progress bar is accepted. One item moves from 'not
> commitments' into the list with an owner. Nothing else changes — same four items, same owners,
> same deadlines. That is the test that the product reads state, not keywords."

---

**2:05 – 2:30 — When it should refuse**

Click **Sample C — hedged answer**, then **Extract commitments**.

> "Here one speaker says 'let's call it a maybe'. That is not a commitment and it is not a rejection,
> so it is reported as ambiguous with an open question naming what is undecided. And because this
> call does state its date, 'by this Friday' resolves to the sixth of March."

Point at the resolved date and at the `ambiguous` label.

---

**2:30 – 2:55 — Evidence, speed and cost**

> "Every line has a quote you can play, and the timestamps come from the audio, not from the model —
> the model only says which utterance it read. Fourteen to nineteen seconds to a result, about five
> cents per recording at list price, of which the model is eighty-five percent. Those numbers are
> measured, and the runs are in the repository."

Optionally show `reports/e2e-latency.json` or the metrics strip.

---

**2:55 – 3:00 — Limits**

> "Known limits: synthetic test audio, no crosstalk handling, and no way yet for a human to correct
> an item in place. That is what I would do next."
