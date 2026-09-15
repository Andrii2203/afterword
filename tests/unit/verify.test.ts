import { describe, expect, it } from "vitest";
import { verify } from "@/lib/verify";
import type { LlmOutput, Transcript } from "@/lib/types";

function utterance(index: number, speaker: string, startMs: number, text: string) {
  const tokens = text.split(" ");
  return {
    index,
    speaker_label: speaker,
    start_ms: startMs,
    end_ms: startMs + tokens.length * 300,
    text,
    words: tokens.map((w, i) => ({
      text: w,
      start_ms: startMs + i * 300,
      end_ms: startMs + (i + 1) * 300,
    })),
  };
}

const transcript: Transcript = {
  audio_ms: 60_000,
  utterances: [
    utterance(0, "0", 0, "I'm Maya Chen and today is Monday, March 2nd, 2026."),
    utterance(1, "1", 6_000, "I'm Daniel Okafor, backend engineer."),
    utterance(2, "1", 12_000, "I'll fix the duplicate welcome email by this Friday."),
    utterance(3, "0", 18_000, "Someone needs to update the runbook before the release."),
    utterance(4, "1", 24_000, "We could add a progress bar, but I won't commit to it today."),
    utterance(5, "0", 30_000, "Do we need legal to review the consent text?"),
  ],
};

function baseLlm(): LlmOutput {
  return {
    anchor_date: "2026-03-02",
    speakers: [
      { speaker_label: "0", name: "Maya Chen", utterance_index: 0, quote: "I'm Maya Chen" },
      { speaker_label: "1", name: "Daniel Okafor", utterance_index: 1, quote: "I'm Daniel Okafor" },
    ],
    commitments: [
      {
        title: "Fix the duplicate welcome email",
        owner_name: "Daniel Okafor",
        deadline_raw: "by this Friday",
        deadline_kind: "relative",
        deadline_absolute: "",
        evidence: [
          {
            utterance_index: 2,
            quote: "I'll fix the duplicate welcome email by this Friday",
            kind: "acceptance",
          },
        ],
        superseded: [],
      },
    ],
    excluded: [],
    open_questions: [],
  };
}

describe("verify", () => {
  it("resolves a relative deadline against the anchor date spoken in the recording", () => {
    const result = verify({ llm: baseLlm(), transcript });
    expect(result.anchor).toEqual({ date: "2026-03-02", source: "recording" });
    expect(result.commitments[0].deadline).toEqual({
      raw: "by this Friday",
      date: "2026-03-06",
      status: "resolved",
    });
    expect(result.warnings).not.toContain("missing_date_context");
  });

  it("keeps a relative deadline unresolved and warns when no anchor date exists", () => {
    const stripped: Transcript = {
      ...transcript,
      utterances: [utterance(0, "0", 0, "I'm Maya Chen."), ...transcript.utterances.slice(1)],
    };
    const llm = baseLlm();
    llm.anchor_date = "";
    llm.speakers[0].quote = "I'm Maya Chen";
    const result = verify({ llm, transcript: stripped });
    expect(result.anchor.source).toBe("none");
    expect(result.commitments[0].deadline).toEqual({
      raw: "by this Friday",
      date: null,
      status: "unresolved_relative",
    });
    expect(result.warnings).toContain("missing_date_context");
  });

  it("never uses the system clock as an anchor date", () => {
    const stripped: Transcript = {
      ...transcript,
      utterances: [utterance(0, "0", 0, "I'm Maya Chen."), ...transcript.utterances.slice(1)],
    };
    const llm = baseLlm();
    llm.anchor_date = new Date().toISOString().slice(0, 10);
    const result = verify({ llm, transcript: stripped });
    expect(result.anchor.date).toBeNull();
    expect(result.commitments[0].deadline.date).toBeNull();
  });

  it("accepts a user-supplied anchor date and labels its source", () => {
    const stripped: Transcript = {
      ...transcript,
      utterances: [utterance(0, "0", 0, "I'm Maya Chen."), ...transcript.utterances.slice(1)],
    };
    const llm = baseLlm();
    llm.anchor_date = "";
    const result = verify({ llm, transcript: stripped, userAnchorDate: "2026-03-02" });
    expect(result.anchor).toEqual({ date: "2026-03-02", source: "user" });
    expect(result.commitments[0].deadline.status).toBe("resolved");
  });

  it("binds evidence to word-level timestamps taken from the transcript", () => {
    const result = verify({ llm: baseLlm(), transcript });
    const evidence = result.commitments[0].evidence[0];
    expect(evidence.start_ms).toBe(12_000);
    expect(evidence.end_ms).toBeLessThanOrEqual(transcript.audio_ms);
    expect(evidence.speaker).toBe("Daniel Okafor");
  });

  it("drops an item whose quote is not in the transcript and warns", () => {
    const llm = baseLlm();
    llm.commitments[0].evidence = [
      { utterance_index: 2, quote: "I will rewrite the billing service", kind: "acceptance" },
    ];
    const result = verify({ llm, transcript });
    expect(result.commitments).toHaveLength(0);
    expect(result.warnings).toContain("evidence_unverified");
  });

  it("marks an owner as unassigned when no name was given", () => {
    const llm = baseLlm();
    llm.commitments[0] = {
      ...llm.commitments[0],
      title: "Update the release runbook",
      owner_name: "",
      deadline_raw: "before the release",
      evidence: [
        {
          utterance_index: 3,
          quote: "Someone needs to update the runbook before the release",
          kind: "acceptance",
        },
      ],
    };
    const result = verify({ llm, transcript });
    expect(result.commitments[0].owner).toEqual({ name: null, status: "unassigned" });
    expect(result.commitments[0].deadline.status).toBe("unresolved_relative");
  });

  it("clears an owner who was never named in the recording and warns", () => {
    const llm = baseLlm();
    llm.commitments[0].owner_name = "Priya Raman";
    const result = verify({ llm, transcript });
    expect(result.commitments[0].owner).toEqual({ name: null, status: "unassigned" });
    expect(result.warnings).toContain("owner_not_a_known_name");
  });

  it("expands an owner given by first name to the introduced full name", () => {
    const llm = baseLlm();
    llm.commitments[0].owner_name = "Daniel";
    const result = verify({ llm, transcript });
    expect(result.commitments[0].owner).toEqual({ name: "Daniel Okafor", status: "named" });
  });

  it("keeps the corrected value and records the superseded one", () => {
    const llm = baseLlm();
    llm.commitments[0].superseded = [
      {
        field: "deadline",
        old_value: "Tuesday",
        utterance_index: 2,
        quote: "I'll fix the duplicate welcome email",
      },
    ];
    const result = verify({ llm, transcript });
    expect(result.commitments[0].deadline.raw).toBe("by this Friday");
    expect(result.commitments[0].superseded[0].old_value).toBe("Tuesday");
    expect(result.commitments[0].superseded[0].evidence.start_ms).toBe(12_000);
  });

  it("keeps a never-accepted proposal out of commitments", () => {
    const llm = baseLlm();
    llm.excluded = [
      {
        title: "Add a progress bar",
        reason: "never_accepted",
        evidence: [{ utterance_index: 4, quote: "I won't commit to it today", kind: "mention" }],
      },
    ];
    const result = verify({ llm, transcript });
    expect(result.commitments.map((c) => c.title)).not.toContain("Add a progress bar");
    expect(result.excluded[0]).toEqual(
      expect.objectContaining({ reason: "never_accepted", id: "x1" }),
    );
  });

  it("removes an ambiguous exclusion when no open question survives", () => {
    const llm = baseLlm();
    llm.excluded = [
      {
        title: "Refresh the API docs",
        reason: "ambiguous",
        evidence: [{ utterance_index: 4, quote: "I won't commit to it today", kind: "mention" }],
      },
    ];
    const result = verify({ llm, transcript });
    expect(result.excluded).toHaveLength(0);
  });

  it("keeps an ambiguous exclusion when an open question survives", () => {
    const llm = baseLlm();
    llm.excluded = [
      {
        title: "Refresh the API docs",
        reason: "ambiguous",
        evidence: [{ utterance_index: 4, quote: "I won't commit to it today", kind: "mention" }],
      },
    ];
    llm.open_questions = [
      {
        question: "Will Daniel refresh the API docs?",
        raised_by: "Maya Chen",
        evidence: [{ utterance_index: 4, quote: "We could add a progress bar", kind: "mention" }],
      },
    ];
    const result = verify({ llm, transcript });
    expect(result.excluded).toHaveLength(1);
    expect(result.open_questions[0].id).toBe("q1");
  });

  it("binds a name when the model echoes the display label instead of the diarization label", () => {
    const llm = baseLlm();
    llm.speakers = llm.speakers.map((s) => ({ ...s, speaker_label: `speaker_${s.speaker_label}` }));
    const result = verify({ llm, transcript });
    expect(result.speakers.map((s) => s.name)).toEqual(["Maya Chen", "Daniel Okafor"]);
    expect(result.warnings).not.toContain("speaker_unnamed");
    expect(result.commitments[0].evidence[0].speaker).toBe("Daniel Okafor");
  });

  it("falls back to the speaker of the quoted utterance for an unknown label", () => {
    const llm = baseLlm();
    llm.speakers = [{ ...llm.speakers[1], speaker_label: "B" }];
    const result = verify({ llm, transcript });
    expect(result.speakers.find((s) => s.label === "1")?.name).toBe("Daniel Okafor");
  });

  it("warns when a diarized speaker never gets a name", () => {
    const llm = baseLlm();
    llm.speakers = [llm.speakers[0]];
    const result = verify({ llm, transcript });
    expect(result.warnings).toContain("speaker_unnamed");
    expect(result.speakers.find((s) => s.label === "1")?.name).toBeNull();
  });

  it("orders commitments by the start of their first evidence", () => {
    const llm = baseLlm();
    llm.commitments.push({
      title: "Update the release runbook",
      owner_name: "",
      deadline_raw: "",
      deadline_kind: "none",
      deadline_absolute: "",
      evidence: [
        { utterance_index: 3, quote: "Someone needs to update the runbook", kind: "acceptance" },
      ],
      superseded: [],
    });
    const result = verify({ llm, transcript });
    expect(result.commitments.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(result.commitments[0].evidence[0].start_ms).toBeLessThan(
      result.commitments[1].evidence[0].start_ms,
    );
  });
});
