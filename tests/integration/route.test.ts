import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/process/route";
import { setProviders } from "@/lib/providers";
import type { CommitmentsDocument } from "@/lib/types";
import {
  loadLlmOutput,
  loadTranscript,
  stubAsr,
  stubExtractor,
} from "../support/fixtures";

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

afterEach(() => setProviders(null));

describe("POST /api/process", () => {
  it("returns the commitments document for a valid upload", async () => {
    useFixture("meeting-a");
    const response = await POST(upload(audioForm()));
    expect(response.status).toBe(200);
    const document = (await response.json()) as CommitmentsDocument;
    expect(document.commitments.length).toBe(3);
    expect(document.excluded.length).toBe(2);
    expect(document.open_questions.length).toBe(1);
    expect(document.meta.filename).toBe("meeting.wav");
    expect(document.transcript.utterances.length).toBeGreaterThan(0);
  });

  it("uses a user supplied recording date only as an anchor and labels it", async () => {
    useFixture("meeting-a");
    const response = await POST(upload(audioForm("audio/wav", { anchor_date: "2026-03-02" })));
    const document = (await response.json()) as CommitmentsDocument;
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
    const document = (await response.json()) as CommitmentsDocument;
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

  it("rejects a recording over the duration limit", async () => {
    const transcript = loadTranscript("meeting-a");
    setProviders({
      asr: stubAsr({ ...transcript, audio_ms: 240_000 }),
      extractor: stubExtractor(loadLlmOutput("meeting-a")),
    });
    const response = await POST(upload(audioForm()));
    expect(response.status).toBe(413);
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
    const response = await POST(upload(audioForm()));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/401/);
  });

  it("processes each upload instead of replaying a stored answer", async () => {
    useFixture("meeting-a");
    const first = (await (await POST(upload(audioForm()))).json()) as CommitmentsDocument;
    useFixture("meeting-c");
    const second = (await (await POST(upload(audioForm()))).json()) as CommitmentsDocument;
    expect(second.commitments.map((c) => c.title)).not.toEqual(
      first.commitments.map((c) => c.title),
    );
    expect(second.meta.run_id).not.toBe(first.meta.run_id);
  });
});
