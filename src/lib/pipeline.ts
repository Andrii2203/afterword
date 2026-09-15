import type { AsrProvider } from "./asr";
import type { Extractor } from "./extract";
import type { PipelineEvent } from "./events";
import { computeMetrics } from "./metrics";
import { DocumentSchema, type CommitmentsDocument } from "./types";
import { verify } from "./verify";

export const MAX_AUDIO_MS = 180_000;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "video/webm",
];

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface PipelineDeps {
  asr: AsrProvider;
  extractor: Extractor;
}

export interface PipelineInput {
  runId: string;
  audio: Uint8Array;
  contentType: string;
  filename: string;
  userAnchorDate?: string | null;
}

/** SPEC P1-P7; `onEvent` receives each stage as it completes (ADR-0021). */
export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
  onEvent: (event: PipelineEvent) => void = () => {},
): Promise<CommitmentsDocument> {
  const started = Date.now();
  const since = () => Date.now() - started;

  if (input.audio.byteLength === 0) throw new PipelineError("The uploaded file is empty.", 400);
  if (input.audio.byteLength > MAX_UPLOAD_BYTES) {
    throw new PipelineError("The uploaded file is larger than 25 MB.", 413);
  }

  onEvent({ type: "stage", stage: "transcribing", at_ms: since() });
  const asr = await deps.asr.transcribe(input.audio, input.contentType);
  if (asr.transcript.utterances.length === 0) {
    throw new PipelineError("No speech was recognised in this file.", 422);
  }
  if (asr.transcript.audio_ms > MAX_AUDIO_MS) {
    throw new PipelineError("The recording is longer than the 180 second limit.", 413);
  }
  onEvent({ type: "transcript", transcript: asr.transcript, asr_ms: asr.ms });

  onEvent({ type: "stage", stage: "extracting", at_ms: since() });
  const extraction = await deps.extractor.extract({ transcript: asr.transcript });

  onEvent({ type: "stage", stage: "verifying", at_ms: since() });
  const verified = verify({
    llm: extraction.output,
    transcript: asr.transcript,
    userAnchorDate: input.userAnchorDate ?? null,
  });

  const total = Date.now() - started;
  const document: CommitmentsDocument = {
    meta: {
      run_id: input.runId,
      created_at: new Date().toISOString(),
      audio_ms: asr.transcript.audio_ms,
      filename: input.filename,
      anchor_date: verified.anchor.date,
      anchor_date_source: verified.anchor.source,
    },
    speakers: verified.speakers,
    commitments: verified.commitments,
    excluded: verified.excluded,
    open_questions: verified.open_questions,
    transcript: asr.transcript,
    metrics: computeMetrics({
      audio_seconds: asr.transcript.audio_ms / 1000,
      asr_ms: asr.ms,
      llm_ms: extraction.ms,
      total_ms: total,
      tokens: extraction.tokens,
    }),
    warnings: extraction.tokens.retries > 0 ? [...verified.warnings, "llm_retry"] : verified.warnings,
  };

  const parsed = DocumentSchema.parse(document);
  onEvent({ type: "document", document: parsed });
  return parsed;
}
