import { describe, expect, it } from "vitest";
import { runPipeline } from "@/lib/pipeline";
import { score } from "@/lib/score";
import {
  FIXTURE_IDS,
  loadExpected,
  loadLlmOutput,
  loadTranscript,
  stubAsr,
  stubExtractor,
} from "../support/fixtures";

const audio = new Uint8Array([1, 2, 3, 4]);

async function run(id: (typeof FIXTURE_IDS)[number]) {
  const transcript = loadTranscript(id);
  return runPipeline(
    { runId: `run-${id}`, audio, contentType: "audio/wav", filename: `${id}.wav` },
    { asr: stubAsr(transcript), extractor: stubExtractor(loadLlmOutput(id)) },
  );
}

describe.each(FIXTURE_IDS)("pipeline on %s", (id) => {
  it("matches the expected commitments list", async () => {
    const report = score(await run(id), loadExpected(id));
    expect(report.failures).toEqual([]);
    expect(report.inclusion_recall).toBe(1);
    expect(report.exclusion_precision).toBe(1);
  });

  it("keeps every evidence span inside the audio", async () => {
    const document = await run(id);
    const everyEvidence = [
      ...document.commitments.flatMap((c) => c.evidence),
      ...document.excluded.flatMap((x) => x.evidence),
      ...document.open_questions.flatMap((q) => q.evidence),
    ];
    expect(everyEvidence.length).toBeGreaterThan(0);
    for (const evidence of everyEvidence) {
      expect(evidence.start_ms).toBeLessThan(evidence.end_ms);
      expect(evidence.end_ms).toBeLessThanOrEqual(document.meta.audio_ms);
    }
  });

  it("reports measured cost and latency", async () => {
    const { metrics } = await run(id);
    expect(metrics.cost_per_audio_minute_usd).toBeGreaterThan(0);
    expect(metrics.asr_ms).toBeGreaterThan(0);
    expect(metrics.llm_ms).toBeGreaterThan(0);
    expect(metrics.total_ms).toBeGreaterThanOrEqual(0);
  });
});

describe("pipeline state rules", () => {
  it("does not promote a never accepted proposal in variant A", async () => {
    const document = await run("meeting-a");
    expect(document.commitments.map((c) => c.title).join(" ")).not.toMatch(/progress bar/i);
    expect(document.excluded.find((x) => /progress bar/i.test(x.title))?.reason).toBe(
      "never_accepted",
    );
  });

  it("promotes the same proposal in variant B, where it was accepted", async () => {
    const document = await run("meeting-b");
    const promoted = document.commitments.find((c) => /progress bar/i.test(c.title));
    expect(promoted?.owner).toEqual({ name: "Daniel Okafor", status: "named" });
    expect(document.excluded.some((x) => /progress bar/i.test(x.title))).toBe(false);
  });

  it("changes nothing else between variant A and variant B", async () => {
    const topics = ["duplicate", "checklist", "runbook", "progress bar", "migration"];
    const shape = (document: Awaited<ReturnType<typeof run>>) =>
      document.commitments
        .map((c) => {
          const topic = topics.find((t) => new RegExp(t, "i").test(c.title)) ?? c.title;
          return `${topic}|${c.owner.status}:${c.owner.name ?? ""}|${c.deadline.status}`;
        })
        .filter((row) => !row.startsWith("progress bar"))
        .sort();

    expect(shape(await run("meeting-b"))).toEqual(shape(await run("meeting-a")));
  });

  it("keeps a cancelled task out of commitments in both variants", async () => {
    for (const id of ["meeting-a", "meeting-b"] as const) {
      const document = await run(id);
      expect(document.commitments.map((c) => c.title).join(" ")).not.toMatch(/migration/i);
      expect(document.excluded.find((x) => /migration/i.test(x.title))?.reason).toBe("cancelled");
    }
  });

  it("declines to conclude on a hedged acceptance", async () => {
    const document = await run("meeting-c");
    expect(document.commitments.map((c) => c.title).join(" ")).not.toMatch(/documentation/i);
    expect(document.excluded[0].reason).toBe("ambiguous");
    expect(document.open_questions.length).toBeGreaterThanOrEqual(1);
  });

  it("marks missing date context only when no anchor date was spoken", async () => {
    expect((await run("meeting-a")).warnings).toContain("missing_date_context");
    expect((await run("meeting-c")).warnings).not.toContain("missing_date_context");
    expect((await run("meeting-c")).meta.anchor_date).toBe("2026-03-02");
  });

  it("rejects a recording longer than the limit before reporting anything", async () => {
    const transcript = loadTranscript("meeting-a");
    await expect(
      runPipeline(
        { runId: "too-long", audio, contentType: "audio/wav", filename: "long.wav" },
        {
          asr: stubAsr({ ...transcript, audio_ms: 240_000 }),
          extractor: stubExtractor(loadLlmOutput("meeting-a")),
        },
      ),
    ).rejects.toThrow(/180 second/);
  });
});

describe("speaker attribution on the recorded runs", () => {
  async function speakerOf(id: (typeof FIXTURE_IDS)[number], fragment: string) {
    const document = await run(id);
    const needle = fragment.toLowerCase();
    const utterance = document.transcript.utterances.find((u) =>
      u.text.toLowerCase().includes(needle),
    );
    expect(utterance, `no utterance contains "${fragment}"`).toBeDefined();
    return document.speakers.find((s) => s.label === utterance!.speaker_label)?.name;
  }

  it.each([
    ["meeting-a", "commit to that today", "Daniel Okafor"],
    ["meeting-a", "nobody is picking it up", "Maya Chen"],
    ["meeting-a", "I have not asked them", "Maya Chen"],
    ["meeting-b", "Fair point", "Maya Chen"],
    ["meeting-b", "That one is yours as well", "Maya Chen"],
    ["meeting-b", "We are not deciding who does that", "Maya Chen"],
    ["meeting-c", "So is that a yes", "Maya Chen"],
    ["meeting-c", "Let's call it a maybe", "Daniel Okafor"],
  ] as const)("%s: \"%s\" is said by %s", async (id, fragment, speaker) => {
    expect(await speakerOf(id, fragment)).toBe(speaker);
  });

  it.each(FIXTURE_IDS)("%s: every quote is shown under the speaker of its utterance", async (id) => {
    const document = await run(id);
    const nameOf = (label: string) => document.speakers.find((s) => s.label === label)?.name ?? null;
    const evidence = [
      ...document.commitments.flatMap((c) => c.evidence),
      ...document.excluded.flatMap((x) => x.evidence),
      ...document.open_questions.flatMap((q) => q.evidence),
    ];
    for (const item of evidence) {
      const utterance = document.transcript.utterances.find((u) => u.index === item.utterance_index);
      expect(item.speaker).toBe(nameOf(utterance!.speaker_label));
    }
  });
});

describe("language of the recording", () => {
  function extractorSpy() {
    const calls: number[] = [];
    const inner = stubExtractor(loadLlmOutput("meeting-a"));
    return {
      calls,
      extractor: {
        model: inner.model,
        async extract(input: Parameters<typeof inner.extract>[0]) {
          calls.push(1);
          return inner.extract(input);
        },
      },
    };
  }

  async function runWithLanguage(language: string) {
    const spy = extractorSpy();
    const result = runPipeline(
      { runId: "run-language", audio, contentType: "audio/wav", filename: "meeting.wav" },
      { asr: stubAsr(loadTranscript("meeting-a"), 1_200, language), extractor: spy.extractor },
    );
    return { result, spy };
  }

  it("refuses a recording detected as another language without calling the model", async () => {
    const { result, spy } = await runWithLanguage("uk");
    await expect(result).rejects.toThrow(/Ukrainian/);
    await expect(result).rejects.toMatchObject({ status: 422 });
    expect(spy.calls).toHaveLength(0);
  });

  it("processes a recording detected as an English variant", async () => {
    const { result, spy } = await runWithLanguage("en-US");
    await expect(result).resolves.toMatchObject({ meta: { filename: "meeting.wav" } });
    expect(spy.calls).toHaveLength(1);
  });
});
