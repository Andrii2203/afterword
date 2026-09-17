import { describe, expect, it } from "vitest";
import {
  detectedLanguage,
  isEnglish,
  mapDeepgramResponse,
  nonEnglishMessage,
  type DeepgramResponse,
} from "@/lib/asr";

function word(text: string, start: number, speaker?: number) {
  return { word: text.toLowerCase(), punctuated_word: text, start, end: start + 0.4, speaker };
}

function response(utterances: NonNullable<DeepgramResponse["results"]>["utterances"]): DeepgramResponse {
  return { metadata: { duration: 20 }, results: { utterances } };
}

describe("mapDeepgramResponse", () => {
  it("keeps a single-speaker utterance as one utterance", () => {
    const transcript = mapDeepgramResponse(
      response([
        {
          start: 1,
          end: 2.2,
          speaker: 0,
          transcript: "Hi, Daniel.",
          words: [word("Hi,", 1, 0), word("Daniel.", 1.8, 0)],
        },
      ]),
    );
    expect(transcript.audio_ms).toBe(20_000);
    expect(transcript.utterances).toEqual([
      {
        index: 0,
        speaker_label: "0",
        start_ms: 1_000,
        end_ms: 2_200,
        text: "Hi, Daniel.",
        words: [
          { text: "Hi,", start_ms: 1_000, end_ms: 1_400 },
          { text: "Daniel.", start_ms: 1_800, end_ms: 2_200 },
        ],
      },
    ]);
  });

  it("splits an utterance where the speaker of its words changes", () => {
    const transcript = mapDeepgramResponse(
      response([
        {
          start: 47.3,
          end: 55,
          speaker: 0,
          transcript: "Add a progress bar. We could, but no.",
          words: [
            word("Add", 47.3, 0),
            word("a", 47.7, 0),
            word("progress", 48.1, 0),
            word("bar.", 48.5, 0),
            word("We", 52.4, 1),
            word("could,", 52.8, 1),
            word("but", 53.2, 1),
            word("no.", 53.6, 1),
          ],
        },
      ]),
    );

    expect(transcript.utterances.map((u) => [u.speaker_label, u.text])).toEqual([
      ["0", "Add a progress bar."],
      ["1", "We could, but no."],
    ]);
    expect(transcript.utterances[1]).toEqual(
      expect.objectContaining({ index: 1, start_ms: 52_400, end_ms: 54_000 }),
    );
    expect(transcript.utterances[0].end_ms).toBe(48_900);
  });

  it("splits a back-and-forth exchange into one utterance per turn", () => {
    const transcript = mapDeepgramResponse(
      response([
        {
          start: 0,
          end: 3,
          speaker: 1,
          transcript: "Yes? No. Fine.",
          words: [word("Yes?", 0, 1), word("No.", 1, 0), word("Fine.", 2, 1)],
        },
      ]),
    );
    expect(transcript.utterances.map((u) => u.speaker_label)).toEqual(["1", "0", "1"]);
  });

  it("numbers utterances continuously across Deepgram utterances", () => {
    const transcript = mapDeepgramResponse(
      response([
        {
          start: 0,
          end: 2,
          speaker: 0,
          transcript: "One. Two.",
          words: [word("One.", 0, 0), word("Two.", 1, 1)],
        },
        { start: 3, end: 4, speaker: 0, transcript: "Three.", words: [word("Three.", 3, 0)] },
      ]),
    );
    expect(transcript.utterances.map((u) => u.index)).toEqual([0, 1, 2]);
  });

  it("uses the utterance speaker for words that carry no speaker", () => {
    const transcript = mapDeepgramResponse(
      response([
        {
          start: 0,
          end: 2,
          speaker: 1,
          transcript: "No labels here.",
          words: [word("No", 0), word("labels", 0.5), word("here.", 1)],
        },
      ]),
    );
    expect(transcript.utterances).toHaveLength(1);
    expect(transcript.utterances[0].speaker_label).toBe("1");
  });

  it("keeps the recognition and speaker confidence of every word", () => {
    const transcript = mapDeepgramResponse(
      response([
        {
          start: 0,
          end: 1,
          speaker: 0,
          transcript: "We can.",
          words: [
            { ...word("We", 0, 0), confidence: 0.99, speaker_confidence: 0.8 },
            { ...word("can.", 0.5, 0), confidence: 0.41, speaker_confidence: 0.62 },
          ],
        },
      ]),
    );
    expect(transcript.utterances[0].words.map((w) => [w.confidence, w.speaker_confidence])).toEqual([
      [0.99, 0.8],
      [0.41, 0.62],
    ]);
  });

  it("omits confidence fields the provider did not send", () => {
    const transcript = mapDeepgramResponse(
      response([{ start: 0, end: 1, speaker: 0, transcript: "Ok.", words: [word("Ok.", 0, 0)] }]),
    );
    expect(Object.keys(transcript.utterances[0].words[0]).sort()).toEqual([
      "end_ms",
      "start_ms",
      "text",
    ]);
  });

  it("keeps an utterance that has no words", () => {
    const transcript = mapDeepgramResponse(
      response([{ start: 5, end: 6, speaker: 0, transcript: "Hmm.", words: [] }]),
    );
    expect(transcript.utterances).toEqual([
      { index: 0, speaker_label: "0", start_ms: 5_000, end_ms: 6_000, text: "Hmm.", words: [] },
    ]);
  });
});

describe("language detection", () => {
  const detected = (language?: string): DeepgramResponse => ({
    metadata: { duration: 20 },
    results: { channels: language ? [{ detected_language: language }] : [{}], utterances: [] },
  });

  it("reads the language Deepgram detected, or nothing when it reported none", () => {
    expect(detectedLanguage(detected("es"))).toBe("es");
    expect(detectedLanguage(detected())).toBeNull();
    expect(detectedLanguage({})).toBeNull();
  });

  it("accepts every English variant and refuses another language", () => {
    expect(isEnglish("en")).toBe(true);
    expect(isEnglish("en-US")).toBe(true);
    expect(isEnglish("EN_GB")).toBe(true);
    expect(isEnglish("es")).toBe(false);
    expect(isEnglish("uk")).toBe(false);
  });

  it("names the detected language in the refusal", () => {
    expect(nonEnglishMessage("es")).toContain("Spanish");
    expect(nonEnglishMessage("uk")).toContain("Ukrainian");
    expect(nonEnglishMessage("es")).toMatch(/English recordings only/);
  });

  it("falls back to the code when it names no known language", () => {
    expect(nonEnglishMessage("zzz")).toContain("zzz");
  });
});
