"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_AUDIO_MS } from "@/lib/pipeline";
import { msToClock } from "@/lib/transcript";
import type { CommitmentsDocument, Evidence } from "@/lib/types";

type Status = "idle" | "reading" | "processing" | "done" | "error";

const SAMPLES = [
  { id: "meeting-a", label: "Sample A — base call" },
  { id: "meeting-b", label: "Sample B — one agreement changed" },
  { id: "meeting-c", label: "Sample C — hedged answer" },
];

const WARNING_TEXT: Record<string, string> = {
  missing_date_context:
    "No calendar date was spoken, so relative deadlines are kept as they were said.",
  evidence_unverified: "At least one item was dropped because its quote is not in the transcript.",
  owner_not_a_known_name: "An owner was cleared because that name is never spoken in the recording.",
  speaker_unnamed: "A speaker never introduced themselves, so their name is unknown.",
  llm_retry: "The extraction call was retried once; both attempts are included in the cost.",
};

export default function Analyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [anchorDate, setAnchorDate] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<CommitmentsDocument | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAtRef = useRef<number | null>(null);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  useEffect(() => {
    if (status !== "processing") return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(timer);
  }, [status]);

  async function onPick(picked: File | null) {
    setDocument(null);
    setError(null);
    setStatus("reading");
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (!picked) {
      setFile(null);
      setAudioUrl(null);
      setStatus("idle");
      return;
    }
    const url = URL.createObjectURL(picked);
    const seconds = await readDuration(url);
    if (seconds !== null && seconds * 1000 > MAX_AUDIO_MS) {
      URL.revokeObjectURL(url);
      setFile(null);
      setAudioUrl(null);
      setError(`This recording is ${Math.round(seconds)} s long; the limit is 180 s.`);
      setStatus("error");
      return;
    }
    setFile(picked);
    setAudioUrl(url);
    setStatus("idle");
  }

  async function loadSample(id: string) {
    setError(null);
    const response = await fetch(`/samples/${id}.wav`);
    if (!response.ok) {
      setError(`Sample ${id} is not available on this deployment.`);
      setStatus("error");
      return;
    }
    const blob = await response.blob();
    await onPick(new File([blob], `${id}.wav`, { type: "audio/wav" }));
  }

  function downloadResult() {
    if (!document) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.meta.filename.replace(/\.[a-z0-9]+$/i, "")}.commitments.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onProcess() {
    if (!file) return;
    setStatus("processing");
    setError(null);
    setDocument(null);
    const body = new FormData();
    body.set("file", file);
    if (anchorDate) body.set("anchor_date", anchorDate);
    try {
      const response = await fetch("/api/process", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
      setDocument(payload as CommitmentsDocument);
      setStatus("done");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Processing failed.");
      setStatus("error");
    }
  }

  function play(evidence: Evidence) {
    const audio = audioRef.current;
    if (!audio) return;
    stopAtRef.current = evidence.end_ms / 1000;
    audio.currentTime = evidence.start_ms / 1000;
    void audio.play();
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || stopAtRef.current === null) return;
    if (audio.currentTime >= stopAtRef.current) {
      audio.pause();
      stopAtRef.current = null;
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Afterword</h1>
        <p className="mt-2 text-sm text-muted">
          Upload a recorded project discussion. You get the tasks as they stood when the recording
          ended: owner, deadline, open questions, and a playable quote behind every line.
        </p>
        <p className="mt-2 text-xs text-muted">
          Scope: English, two speakers who introduce themselves, up to 180 seconds.
        </p>
      </header>

      <section className="rounded-lg border border-line bg-panel p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Recording</span>
            <input
              data-testid="upload-input"
              type="file"
              accept="audio/*,video/webm"
              className="w-full cursor-pointer rounded border border-line bg-background p-2 text-sm"
              onChange={(event) => void onPick(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">
              Recording date <span className="font-normal text-muted">(optional)</span>
            </span>
            <input
              data-testid="anchor-date"
              type="date"
              value={anchorDate}
              onChange={(event) => setAnchorDate(event.target.value)}
              className="rounded border border-line bg-background p-2 text-sm"
            />
          </label>
          <button
            data-testid="process-button"
            type="button"
            disabled={!file || status === "processing"}
            onClick={() => void onProcess()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {status === "processing" ? `Working ${(elapsed / 1000).toFixed(1)} s` : "Extract commitments"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">No recording at hand?</span>
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              data-testid={`sample-${sample.id}`}
              onClick={() => void loadSample(sample.id)}
              className="rounded border border-line px-2 py-1 hover:border-accent"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            onTimeUpdate={onTimeUpdate}
            data-testid="player"
            className="mt-4 w-full"
          />
        )}

        {error && (
          <p data-testid="error" className="mt-4 text-sm text-red-500">
            {error}
          </p>
        )}
      </section>

      {document && (
        <div className="mt-8 space-y-8">
          <Metrics document={document} />
          <div className="-mt-6 flex justify-end">
            <button
              type="button"
              data-testid="download-json"
              onClick={downloadResult}
              className="text-xs text-muted underline hover:text-foreground"
            >
              Download the full result as JSON
            </button>
          </div>

          {document.warnings.length > 0 && (
            <ul className="space-y-1" data-testid="warnings">
              {document.warnings.map((code) => (
                <li
                  key={code}
                  data-testid="warning"
                  data-code={code}
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
                >
                  {WARNING_TEXT[code] ?? code}
                </li>
              ))}
            </ul>
          )}

          <Section
            title={`Commitments (${document.commitments.length})`}
            hint="Explicitly accepted and not cancelled before the recording ended."
          >
            {document.commitments.map((item) => (
              <article
                key={item.id}
                data-testid="commitment"
                className="rounded-lg border border-line p-4"
              >
                <h3 className="font-medium">{item.title}</h3>
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <Field label="Owner">
                    {item.owner.status === "named" ? (
                      item.owner.name
                    ) : (
                      <span data-testid="unassigned" className="text-muted">
                        not assigned in the recording
                      </span>
                    )}
                  </Field>
                  <Field label="Deadline">
                    <Deadline value={item.deadline} />
                  </Field>
                </dl>
                {item.superseded.map((old, index) => (
                  <p key={index} data-testid="superseded" className="mt-2 text-sm text-muted">
                    Corrected: {old.field} was &ldquo;{old.old_value}&rdquo;
                    <EvidenceChip evidence={old.evidence} onPlay={play} />
                  </p>
                ))}
                <Evidences items={item.evidence} onPlay={play} />
              </article>
            ))}
          </Section>

          <Section
            title={`Not commitments (${document.excluded.length})`}
            hint="Raised in the recording, then never accepted, cancelled, or left ambiguous."
          >
            {document.excluded.map((item) => (
              <article
                key={item.id}
                data-testid="excluded"
                data-reason={item.reason}
                className="rounded-lg border border-line p-4"
              >
                <h3 className="font-medium">
                  {item.title}{" "}
                  <span className="ml-1 rounded bg-panel px-2 py-0.5 text-xs uppercase tracking-wide text-muted">
                    {item.reason.replace("_", " ")}
                  </span>
                </h3>
                <Evidences items={item.evidence} onPlay={play} />
              </article>
            ))}
          </Section>

          <Section
            title={`Open questions (${document.open_questions.length})`}
            hint="Asked in the recording and never answered."
          >
            {document.open_questions.map((item) => (
              <article
                key={item.id}
                data-testid="open-question"
                className="rounded-lg border border-line p-4"
              >
                <h3 className="font-medium">{item.question}</h3>
                {item.raised_by && <p className="mt-1 text-sm text-muted">Raised by {item.raised_by}</p>}
                <Evidences items={item.evidence} onPlay={play} />
              </article>
            ))}
          </Section>

          <details className="rounded-lg border border-line p-4">
            <summary className="cursor-pointer text-sm font-medium">Transcript</summary>
            <ol className="mt-3 space-y-1 text-sm">
              {document.transcript.utterances.map((utterance) => {
                const speaker = document.speakers.find(
                  (s) => s.label === utterance.speaker_label,
                );
                return (
                  <li key={utterance.index} className="flex gap-3">
                    <span className="w-24 shrink-0 text-muted">
                      {msToClock(utterance.start_ms)} {speaker?.name ?? `speaker ${utterance.speaker_label}`}
                    </span>
                    <span>{utterance.text}</span>
                  </li>
                );
              })}
            </ol>
          </details>
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Deadline({ value }: { value: CommitmentsDocument["commitments"][number]["deadline"] }) {
  if (value.status === "none") return <span className="text-muted">none stated</span>;
  if (value.status === "resolved") {
    return (
      <span data-testid="deadline-resolved">
        {value.date} <span className="text-muted">({value.raw})</span>
      </span>
    );
  }
  return (
    <span data-testid="deadline-unresolved">
      &ldquo;{value.raw}&rdquo; <span className="text-muted">— no date context</span>
    </span>
  );
}

function Evidences({ items, onPlay }: { items: Evidence[]; onPlay: (e: Evidence) => void }) {
  return (
    <ul className="mt-3 space-y-1">
      {items.map((evidence, index) => (
        <li key={index}>
          <EvidenceChip evidence={evidence} onPlay={onPlay} />
        </li>
      ))}
    </ul>
  );
}

function EvidenceChip({
  evidence,
  onPlay,
}: {
  evidence: Evidence;
  onPlay: (e: Evidence) => void;
}) {
  return (
    <button
      type="button"
      data-testid="evidence-play"
      data-start-ms={evidence.start_ms}
      data-end-ms={evidence.end_ms}
      onClick={() => onPlay(evidence)}
      className="text-left text-sm text-muted hover:text-foreground"
    >
      <span className="mr-2 rounded bg-panel px-2 py-0.5 font-mono text-xs">
        ▶ {msToClock(evidence.start_ms)}
      </span>
      {evidence.speaker ? `${evidence.speaker}: ` : ""}
      &ldquo;{evidence.quote}&rdquo;
    </button>
  );
}

function Metrics({ document }: { document: CommitmentsDocument }) {
  const { metrics } = document;
  return (
    <section
      data-testid="metrics"
      data-total-ms={metrics.total_ms}
      className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-panel p-4 text-sm sm:grid-cols-4"
    >
      <Field label="Audio">{metrics.audio_seconds.toFixed(1)} s</Field>
      <Field label="Time to result">{(metrics.total_ms / 1000).toFixed(1)} s</Field>
      <Field label="Cost / audio minute">${metrics.cost_per_audio_minute_usd.toFixed(4)}</Field>
      <Field label="Models">
        {metrics.models.asr} + {metrics.models.llm}
      </Field>
    </section>
  );
}

function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () =>
      resolve(Number.isFinite(probe.duration) ? probe.duration : null);
    probe.onerror = () => resolve(null);
    probe.src = url;
  });
}
