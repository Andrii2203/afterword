import { NextResponse } from "next/server";
import { ACCEPTED_TYPES, PipelineError, runPipeline } from "@/lib/pipeline";
import { getProviders } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the recording as multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file field was sent." }, { status: 400 });
  }

  const contentType = file.type || "audio/wav";
  if (!ACCEPTED_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported audio type ${contentType}.` },
      { status: 415 },
    );
  }

  const anchorField = form.get("anchor_date");
  const userAnchorDate = typeof anchorField === "string" && ISO_DATE.test(anchorField) ? anchorField : null;

  try {
    const document = await runPipeline(
      {
        runId: crypto.randomUUID(),
        audio: new Uint8Array(await file.arrayBuffer()),
        contentType,
        filename: file.name,
        userAnchorDate,
      },
      getProviders(),
    );
    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof PipelineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
