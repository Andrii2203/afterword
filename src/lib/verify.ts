import { findAnchorDate, resolveRelative } from "./dates";
import { locateQuote, normalize } from "./transcript";
import type {
  Commitment,
  Deadline,
  Evidence,
  Excluded,
  LlmEvidence,
  LlmOutput,
  OpenQuestion,
  Owner,
  Speaker,
  Transcript,
} from "./types";

export interface VerifyInput {
  llm: LlmOutput;
  transcript: Transcript;
  userAnchorDate?: string | null;
}

export interface VerifyResult {
  speakers: Speaker[];
  commitments: Commitment[];
  excluded: Excluded[];
  open_questions: OpenQuestion[];
  anchor: { date: string | null; source: "recording" | "user" | "none" };
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Code enforcement of SPEC rules R5-R14. Nothing the model claims about
 * timestamps, dates or owners is trusted; everything is re-derived from the
 * transcript.
 */
export function verify({ llm, transcript, userAnchorDate }: VerifyInput): VerifyResult {
  const warnings = new Set<string>();
  const transcriptText = transcript.utterances.map((u) => u.text).join(" ");
  const normalizedTranscript = normalize(transcriptText);

  // --- speakers ------------------------------------------------------------
  const names: Record<string, string> = {};
  const speakerEvidence: Record<string, Evidence> = {};
  for (const claim of llm.speakers) {
    if (!claim.name.trim()) continue;
    const hit = locateQuote(transcript, claim.quote, claim.utterance_index);
    if (!hit) continue;
    names[claim.speaker_label] = claim.name.trim();
    speakerEvidence[claim.speaker_label] = {
      speaker: claim.name.trim(),
      quote: claim.quote,
      kind: "mention",
      start_ms: hit.start_ms,
      end_ms: hit.end_ms,
      utterance_index: hit.utterance_index,
    };
  }

  const labels = [...new Set(transcript.utterances.map((u) => u.speaker_label))];
  const speakers: Speaker[] = labels.map((label) => {
    if (!names[label]) warnings.add("speaker_unnamed");
    return {
      label,
      name: names[label] ?? null,
      evidence: speakerEvidence[label] ?? null,
    };
  });

  // --- anchor date ---------------------------------------------------------
  const anchor = resolveAnchor(transcriptText, userAnchorDate ?? null);

  // --- evidence ------------------------------------------------------------
  const toEvidence = (item: LlmEvidence): Evidence | null => {
    const hit = locateQuote(transcript, item.quote, item.utterance_index);
    if (!hit) return null;
    return {
      speaker: names[hit.speaker_label] ?? null,
      quote: item.quote.trim(),
      kind: item.kind,
      start_ms: hit.start_ms,
      end_ms: hit.end_ms,
      utterance_index: hit.utterance_index,
    };
  };

  const mapEvidence = (items: LlmEvidence[]): Evidence[] => {
    const mapped = items.map(toEvidence).filter((e): e is Evidence => e !== null);
    if (mapped.length < items.length) warnings.add("evidence_unverified");
    return mapped;
  };

  // --- commitments ---------------------------------------------------------
  const knownNames = Object.values(names);
  const commitments: Omit<Commitment, "id">[] = [];
  for (const item of llm.commitments) {
    const evidence = mapEvidence(item.evidence);
    if (evidence.length === 0) {
      warnings.add("evidence_unverified");
      continue;
    }
    const owner = resolveOwner(item.owner_name, knownNames, normalizedTranscript, warnings);
    const deadline = resolveDeadline(
      item.deadline_kind,
      item.deadline_raw,
      item.deadline_absolute,
      anchor.date,
    );
    if (deadline.status === "unresolved_relative" && anchor.date === null) {
      warnings.add("missing_date_context");
    }
    const superseded = item.superseded
      .map((entry) => {
        const hit = toEvidence({
          utterance_index: entry.utterance_index,
          quote: entry.quote,
          kind: "correction",
        });
        return hit ? { field: entry.field, old_value: entry.old_value, evidence: hit } : null;
      })
      .filter((entry): entry is Commitment["superseded"][number] => entry !== null);

    commitments.push({ title: item.title.trim(), owner, deadline, evidence, superseded });
  }

  // --- excluded and open questions -----------------------------------------
  const excluded: Omit<Excluded, "id">[] = [];
  for (const item of llm.excluded) {
    const evidence = mapEvidence(item.evidence);
    if (evidence.length === 0) {
      warnings.add("evidence_unverified");
      continue;
    }
    excluded.push({ title: item.title.trim(), reason: item.reason, evidence });
  }

  const openQuestions: Omit<OpenQuestion, "id">[] = [];
  for (const item of llm.open_questions) {
    const evidence = mapEvidence(item.evidence);
    if (evidence.length === 0) {
      warnings.add("evidence_unverified");
      continue;
    }
    const raisedBy = knownNames.find(
      (name) => normalize(name) === normalize(item.raised_by ?? ""),
    );
    openQuestions.push({ question: item.question.trim(), raised_by: raisedBy ?? null, evidence });
  }

  // R14: an ambiguous exclusion only exists next to a surviving open question.
  const survivingExcluded =
    openQuestions.length > 0 ? excluded : excluded.filter((e) => e.reason !== "ambiguous");

  return {
    speakers,
    commitments: byStart(commitments).map((item, i) => ({ ...item, id: `c${i + 1}` })),
    excluded: byStart(survivingExcluded).map((item, i) => ({ ...item, id: `x${i + 1}` })),
    open_questions: byStart(openQuestions).map((item, i) => ({ ...item, id: `q${i + 1}` })),
    anchor,
    warnings: [...warnings].sort(),
  };
}

function byStart<T extends { evidence: Evidence[] }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.evidence[0].start_ms - b.evidence[0].start_ms);
}

function resolveAnchor(
  transcriptText: string,
  userAnchorDate: string | null,
): VerifyResult["anchor"] {
  if (userAnchorDate && ISO_DATE.test(userAnchorDate)) {
    return { date: userAnchorDate, source: "user" };
  }
  const spoken = findAnchorDate(transcriptText);
  if (spoken) return { date: spoken, source: "recording" };
  return { date: null, source: "none" };
}

/** R5 and R9: an owner is kept only if the recording named that person. */
function resolveOwner(
  claimed: string,
  knownNames: string[],
  normalizedTranscript: string,
  warnings: Set<string>,
): Owner {
  const name = claimed.trim();
  if (!name) return { name: null, status: "unassigned" };

  const normalized = normalize(name);
  const exact = knownNames.find((known) => normalize(known) === normalized);
  if (exact) return { name: exact, status: "named" };

  const byFirstName = knownNames.find((known) => normalize(known).split(" ")[0] === normalized);
  if (byFirstName) return { name: byFirstName, status: "named" };

  if (normalizedTranscript.includes(normalized)) return { name, status: "named" };

  warnings.add("owner_not_a_known_name");
  return { name: null, status: "unassigned" };
}

/** R6 and D1-D7: a date is produced only from an anchor plus an unambiguous expression. */
function resolveDeadline(
  kind: "relative" | "absolute" | "none",
  raw: string,
  absolute: string,
  anchor: string | null,
): Deadline {
  const rawValue = raw.trim();
  if (kind === "none" || !rawValue) return { raw: null, date: null, status: "none" };

  if (kind === "absolute" && ISO_DATE.test(absolute.trim())) {
    return { raw: rawValue, date: absolute.trim(), status: "resolved" };
  }

  const resolved = resolveRelative(rawValue, anchor);
  return resolved
    ? { raw: rawValue, date: resolved, status: "resolved" }
    : { raw: rawValue, date: null, status: "unresolved_relative" };
}
