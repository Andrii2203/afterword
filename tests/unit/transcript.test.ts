import { describe, expect, it } from "vitest";
import {
  locateQuote,
  msToClock,
  normalize,
  renderTranscript,
} from "@/lib/transcript";
import type { Transcript } from "@/lib/types";

function words(text: string, startMs: number, perWordMs = 400) {
  return text.split(" ").map((w, i) => ({
    text: w,
    start_ms: startMs + i * perWordMs,
    end_ms: startMs + (i + 1) * perWordMs,
  }));
}

const transcript: Transcript = {
  audio_ms: 20_000,
  utterances: [
    {
      index: 0,
      speaker_label: "0",
      start_ms: 0,
      end_ms: 4_000,
      text: "I'm Maya Chen, I lead product on the onboarding project.",
      words: words("I'm Maya Chen, I lead product on the onboarding project.", 0),
    },
    {
      index: 1,
      speaker_label: "1",
      start_ms: 5_000,
      end_ms: 9_000,
      text: "I'll fix the duplicate welcome email by the end of the week.",
      words: words("I'll fix the duplicate welcome email by the end of the week.", 5_000),
    },
  ],
};

describe("normalize", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalize("  I'll  FIX the, duplicate — email. ")).toBe(
      "i'll fix the duplicate email",
    );
  });

  it("is idempotent", () => {
    const once = normalize("Hello,   World!");
    expect(normalize(once)).toBe(once);
  });
});

describe("msToClock", () => {
  it("formats minutes and seconds", () => {
    expect(msToClock(0)).toBe("0:00");
    expect(msToClock(9_400)).toBe("0:09");
    expect(msToClock(65_000)).toBe("1:05");
    expect(msToClock(600_000)).toBe("10:00");
  });
});

describe("renderTranscript", () => {
  it("numbers every utterance and shows the speaker label and clock", () => {
    const rendered = renderTranscript(transcript, { "0": "Maya Chen" });
    expect(rendered).toContain("[0] Maya Chen 0:00");
    expect(rendered).toContain("[1] speaker_1 0:05");
    expect(rendered).toContain("I'll fix the duplicate welcome email");
  });
});

describe("locateQuote", () => {
  it("binds a quote to the hinted utterance and to its word span", () => {
    const hit = locateQuote(transcript, "fix the duplicate welcome email", 1);
    expect(hit).not.toBeNull();
    expect(hit!.utterance_index).toBe(1);
    expect(hit!.start_ms).toBe(5_400);
    expect(hit!.end_ms).toBe(7_400);
  });

  it("ignores case and punctuation differences", () => {
    const hit = locateQuote(transcript, "Fix the DUPLICATE, welcome email!", 1);
    expect(hit).not.toBeNull();
    expect(hit!.utterance_index).toBe(1);
  });

  it("recovers when the model reports the wrong utterance index", () => {
    const hit = locateQuote(transcript, "fix the duplicate welcome email", 0);
    expect(hit).not.toBeNull();
    expect(hit!.utterance_index).toBe(1);
  });

  it("falls back to utterance bounds when the word span cannot be aligned", () => {
    const noWords: Transcript = {
      ...transcript,
      utterances: [{ ...transcript.utterances[1], words: [] }],
    };
    const hit = locateQuote(noWords, "duplicate welcome email", 0);
    expect(hit).toEqual(
      expect.objectContaining({ utterance_index: 1, start_ms: 5_000, end_ms: 9_000 }),
    );
  });

  it("returns null for a quote that is not in the transcript", () => {
    expect(locateQuote(transcript, "we will ship on Mars", 1)).toBeNull();
  });

  it("returns null for an empty quote", () => {
    expect(locateQuote(transcript, "   ", 1)).toBeNull();
  });
});