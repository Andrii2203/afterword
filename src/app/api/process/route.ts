import { NextResponse } from "next/server";
import { NDJSON_CONTENT_TYPE, encodeEvent, type PipelineEvent } from "@/lib/events";
import { clientKey, limiter } from "@/lib/limits";
import { ACCEPTED_TYPES, PipelineError, runPipeline } from "@/lib/pipeline";
import { getProviders } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject("Send the recording as multipart/form-data.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return reject("No file field was sent.", 400);

  const contentType = file.type || "audio/wav";
  if (!ACCEPTED_TYPES.includes(contentType)) {
    return reject(`Unsupported audio type ${contentType}.`, 415);
  }

  const budget = limiter.check(clientKey(request));
  if (!budget.allowed) {
    return NextResponse.json(
      { error: budget.reason },
      {
        status: 429,
        headers: budget.retry_after_seconds
          ? { "retry-after": String(budget.retry_after_seconds) }
          : undefined,
      },
    );
  }

  const anchorField = form.get("anchor_date");
  const userAnchorDate =
    typeof anchorField === "string" && ISO_DATE.test(anchorField) ? anchorField : null;
  const audio = new Uint8Array(await file.arrayBuffer());
  const providers = getProviders(file.name);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PipelineEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));
      try {
        await runPipeline(
          {
            runId: crypto.randomUUID(),
            audio,
            contentType,
            filename: file.name,
            userAnchorDate,
          },
          providers,
          send,
        );
      } catch (error) {
        const status = error instanceof PipelineError ? error.status : 500;
        const message = error instanceof Error ? error.message : "Processing failed.";
        send({ type: "error", error: message, status });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": NDJSON_CONTENT_TYPE,
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

function reject(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}