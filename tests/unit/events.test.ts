import { describe, expect, it } from "vitest";
import { EventDecoder, encodeEvent, readEventStream, type PipelineEvent } from "@/lib/events";

const stage: PipelineEvent = { type: "stage", stage: "transcribing", at_ms: 12 };
const failure: PipelineEvent = { type: "error", error: "Deepgram returned 401", status: 500 };

function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

describe("EventDecoder", () => {
  it("reads one event per line", () => {
    const decoder = new EventDecoder();
    expect(decoder.push(encodeEvent(stage) + encodeEvent(failure))).toEqual([stage, failure]);
    expect(decoder.pending).toBe("");
  });

  it("carries a split event over to the next chunk", () => {
    const line = encodeEvent(stage);
    const decoder = new EventDecoder();
    expect(decoder.push(line.slice(0, 9))).toEqual([]);
    expect(decoder.push(line.slice(9))).toEqual([stage]);
  });

  it("ignores blank lines", () => {
    expect(new EventDecoder().push(`\n\n${encodeEvent(stage)}`)).toEqual([stage]);
  });

  it("reports an unterminated tail as pending", () => {
    const decoder = new EventDecoder();
    decoder.push('{"type":"stage"');
    expect(decoder.pending).toBe('{"type":"stage"');
  });
});

describe("readEventStream", () => {
  it("delivers every event in order across chunk boundaries", async () => {
    const line = encodeEvent(stage);
    const received: PipelineEvent[] = [];
    await readEventStream(streamOf([line.slice(0, 5), line.slice(5), encodeEvent(failure)]), (e) =>
      received.push(e),
    );
    expect(received).toEqual([stage, failure]);
  });

  it("throws when the stream is cut mid-event", async () => {
    await expect(readEventStream(streamOf(['{"type":"sta']), () => {})).rejects.toThrow(
      /middle of an event/,
    );
  });

  it("throws when the response has no body", async () => {
    await expect(readEventStream(new Response(null), () => {})).rejects.toThrow(/no body/);
  });
});