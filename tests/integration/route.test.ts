import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/process/route";
import { readEventStream, type PipelineEvent } from "@/lib/events";
import { DEFAULT_LIMITS, limiter } from "@/lib/limits";
import { setProviders } from "@/lib/providers";
import type { CommitmentsDocument } from "@/lib/types";
import {
  loadLlmOutput,
  loadTranscript,
  stubAsr,
  stubExtractor,
} from "../support/fixtures";

/** Collect every event of a streaming response. */
async function collect(response: Response): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  await readEventStream(response, (event) => events.push(event));
  return events;
}

async function documentOf(response: Response): Promise<CommitmentsDocument> {
  const events = await collect(response);
  const last = events.find((e) => e.type === "document");
  if (!last || last.type !== "document") {
    throw new Error(`no document in stream: ${JSON.stringify(events.map((e) => e.type))}`);
  }
  return last.document;
}

function useFixture(id: "meeting-a" | "meeting-b" | "meeting-c") {
  setProviders({
    asr: stubAsr(loadTranscript(id)),
    extractor: stubExtractor(loadLlmOutput(id)),
  });
}

function upload(body: BodyInit | null, init: RequestInit = {}) {
  return new Request("http://localhost/api/process", { method: "POST", body, ...init });
}

function audioForm(type = "audio/wav", extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "meeting.wav", { type }));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

beforeEach(() => limiter.reset());
afterEach(() => setProviders(null));

describe("POST /api/process", () => {
  it("returns the commitments document for a valid upload", async () => {
    useFixture("meeting-a");
    const response = await POST(upload(audioForm()));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    const document = await documentOf(response);
    expect(document.commitments.length).toBe(3);
    expect(document.excluded.length).toBe(2);
    expect(document.open_questions.length).toBe(1);
    expect(document.meta.filename).toBe("meeting.wav");
    expect(document.transcript.utterances.length).toBeGreaterThan(0);
  });

  it("uses a user supplied recording date only as an anchor and labels it", async () => {
    useFixture("meeting-a");
    const response = await POST(upload(audioForm("audio/wav", { anchor_date: "2026-03-02" })));
    const document = await documentOf(response);
    expect(document.meta.anchor_date_source).toBe("user");
    expect(document.meta.anchor_date).toBe("2026-03-02");
    const checklist = document.commitments.find((c) => /checklist/i.test(c.title));
    expect(checklist?.deadline).toEqual({
      raw: "by Thursday",
      date: "2026-03-05",
      status: "resolved",
    });
  });

  it("ignores a malformed recording date instead of failing", async () => {
    useFixture("meeting-a");
    const response = await POST(upload(audioForm("audio/wav", { anchor_date: "yesterday" })));
    expect(response.status).toBe(200);
    const document = await documentOf(response);
    expect(document.meta.anchor_date_source).toBe("none");
  });

  it("rejects a request with no file", async () => {
    useFixture("meeting-a");
    const response = await POST(upload(new FormData()));
    expect(response.status).toBe(400);
  });

  it("rejects an unsupported media type", async () => {
    useFixture("meeting-a");
    const response = await POST(upload(audioForm("text/plain")));
    expect(response.status).toBe(415);
    expect((await response.json()).error).toMatch(/Unsupported audio type/);
  });

  it("reports a recording over the duration limit as a 413 event", async () => {
    const transcript = loadTranscript("meeting-a");
    setProviders({
      asr: stubAsr({ ...transcript, audio_ms: 240_000 }),
      extractor: stubExtractor(loadLlmOutput("meeting-a")),
    });
    const events = await collect(await POST(upload(audioForm())));
    expect(events.at(-1)).toEqual({
      type: "error",
      error: "The recording is longer than the 180 second limit.",
      status: 413,
    });
    expect(events.some((e) => e.type === "document")).toBe(false);
  });

  it("streams the transcript before the document", async () => {
    useFixture("meeting-a");
    const types = (await collect(await POST(upload(audioForm())))).map((e) => e.type);
    expect(types).toEqual([
      "stage",
      "transcript",
      "stage",
      "stage",
      "document",
    ]);
    expect(types.indexOf("transcript")).toBeLessThan(types.indexOf("document"));
  });

  it("reports a provider failure as a server error with its message", async () => {
    setProviders({
      asr: {
        name: "failing",
        async transcribe() {
          throw new Error("Deepgram returned 401");
        },
      },
      extractor: stubExtractor(loadLlmOutput("meeting-a")),
    });
    const events = await collect(await POST(upload(audioForm())));
    const failure = events.at(-1);
    expect(failure?.type).toBe("error");
    expect(failure).toMatchObject({ status: 500 });
    expect(failure && "error" in failure ? failure.error : "").toMatch(/401/);
  });

  it("refuses a client that exceeds the hourly demo budget", async () => {
    useFixture("meeting-a");
    const headers = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < DEFAULT_LIMITS.perClientPerHour; i += 1) {
      const allowed = await POST(upload(audioForm(), { headers }));
      expect(allowed.status).toBe(200);
      await allowed.body?.cancel();
    }
    const refused = await POST(upload(audioForm(), { headers }));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await refused.json()).error).toMatch(/recordings in the last hour/);
  });

  it("processes each upload instead of replaying a stored answer", async () => {
    useFixture("meeting-a");
    const first = await documentOf(await POST(upload(audioForm())));
    useFixture("meeting-c");
    const second = await documentOf(await POST(upload(audioForm())));
    expect(second.commitments.map((c) => c.title)).not.toEqual(
      first.commitments.map((c) => c.title),
    );
    expect(second.meta.run_id).not.toBe(first.meta.run_id);
  });
});
