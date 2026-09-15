import type { CommitmentsDocument, Transcript } from "./types";

/**
 * The pipeline reports progress as newline-delimited JSON, so the browser can
 * show the transcript while extraction is still running (ADR-0021).
 */
export type PipelineEvent =
  | { type: "stage"; stage: "transcribing" | "extracting" | "verifying"; at_ms: number }
  | { type: "transcript"; transcript: Transcript; asr_ms: number }
  | { type: "document"; document: CommitmentsDocument }
  | { type: "error"; error: string; status: number };

export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

export function encodeEvent(event: PipelineEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Split a byte stream into events. Chunk boundaries fall anywhere, including
 * inside a JSON object, so the tail is carried over to the next call.
 */
export class EventDecoder {
  private buffer = "";

  push(chunk: string): PipelineEvent[] {
    this.buffer += chunk;
    const events: PipelineEvent[] = [];
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) events.push(JSON.parse(line) as PipelineEvent);
      newline = this.buffer.indexOf("\n");
    }
    return events;
  }

  /** Anything left after the last newline; a complete stream leaves nothing. */
  get pending(): string {
    return this.buffer;
  }
}

/** Read a streaming response and hand every event to `onEvent`, in order. */
export async function readEventStream(
  response: Response,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error("The response carried no body.");

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  const decoder = new EventDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of decoder.push(value)) onEvent(event);
  }
  if (decoder.pending.trim()) {
    throw new Error("The stream ended in the middle of an event.");
  }
}
