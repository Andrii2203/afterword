import { findAnchorDate, resolveRelative } from "./dates";
import { confidenceLimits, locateQuote, normalize, uncertaintyOf } from "./transcript";
import type { ConfidenceLimits } from "./transcript";
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
  anchor: { date: string | null; source: "recording" | "user" | "none"; ignored: string | null };
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function verify({ llm, transcript, userAnchorDate }: VerifyInput): VerifyResult {
  const warnings = new Set<string>();
  const transcriptText = transcript.utterances.map((u) => u.text).join(" ");
  const normalizedTranscript = normalize(transcriptText);
  const limits = confidenceLimits(transcript);

  const labels = [...new Set(transcript.utterances.map((u) => u.speaker_label))];
  const names: Record<string, string> = {};
  const speakerEvidence: Record<string, Evidence> = {};
  for (const claim of llm.speakers) {
    const name = claim.name.trim();
    if (!name) continue;
    const hit = locateQuote(transcript, claim.quote, claim.utterance_index);
    if (!hit) continue;

    const label = bindName(claim.quote, name, hit.speaker_label, labels);
    if (!label) {
      warnings.add("speaker_name_unverified");
      continue;
    }

    names[label] = name;
    speakerEvidence[label] = {
      speaker: label === hit.speaker_label ? name : null,
      speaker_label: hit.speaker_label,
      quote: claim.quote,
      kind: "mention",
      start_ms: hit.start_ms,
      end_ms: hit.end_ms,
      utterance_index: hit.utterance_index,
      uncertain: uncertaintyAt(transcript, hit, limits),
    };
  }

  const speakers: Speaker[] = labels.map((label) => {
    if (!names[label]) warnings.add("speaker_unnamed");
    return {
      label,
      name: names[label] ?? null,
      evidence: speakerEvidence[label] ?? null,
    };
  });

  const anchor = resolveAnchor(transcriptText, userAnchorDate ?? null, warnings);

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
      uncertain: uncertaintyAt(transcript, hit, limits),
      speaker_label: hit.speaker_label,
    };
  };

  const mapEvidence = (items: LlmEvidence[]): Evidence[] => {
    const mapped = items.map(toEvidence).filter((e): e is Evidence => e !== null);
    if (mapped.length < items.length) warnings.add("evidence_unverified");
    return mapped;
  };

  const byTime = (evidence: Evidence[]): Evidence[] =>
    [...evidence].sort((a, b) => a.start_ms - b.start_ms);

  const knownNames = Object.values(names);
  const commitments: Entry<Omit<Commitment, "id">>[] = [];
  for (const item of llm.commitments) {
    const evidence = mapEvidence(item.evidence);
    if (evidence.length === 0) {
      warnings.add("evidence_unverified");
      continue;
    }
    const claimed = resolveOwner(item.owner_name, knownNames, normalizedTranscript, warnings);
    const owner =
      claimed.status === "unassigned" ? (ownerByVoice(evidence, names) ?? claimed) : claimed;
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

    commitments.push({
      deciding_ms: evidence[0].start_ms,
      item: { title: item.title.trim(), owner, deadline, evidence: byTime(evidence), superseded },
    });
  }

  const excluded: Entry<Omit<Excluded, "id">>[] = [];
  for (const item of llm.excluded) {
    const evidence = mapEvidence(item.evidence);
    if (evidence.length === 0) {
      warnings.add("evidence_unverified");
      continue;
    }
    excluded.push({
      deciding_ms: evidence[0].start_ms,
      item: { title: item.title.trim(), reason: item.reason, evidence: byTime(evidence) },
    });
  }

  const openQuestions: Entry<Omit<OpenQuestion, "id">>[] = [];
  for (const item of llm.open_questions) {
    const evidence = mapEvidence(item.evidence);
    if (evidence.length === 0) {
      warnings.add("evidence_unverified");
      continue;
    }
    const raisedBy = knownNames.find(
      (name) => normalize(name) === normalize(item.raised_by ?? ""),
    );
    openQuestions.push({
      deciding_ms: evidence[0].start_ms,
      item: {
        question: item.question.trim(),
        raised_by: raisedBy ?? null,
        evidence: byTime(evidence),
      },
    });
  }

  const survivingExcluded =
    openQuestions.length > 0 ? excluded : excluded.filter((e) => e.item.reason !== "ambiguous");

  return {
    speakers,
    commitments: identify(commitments, "c"),
    excluded: identify(survivingExcluded, "x"),
    open_questions: identify(openQuestions, "q"),
    anchor,
    warnings: [...warnings].sort(),
  };
}

function uncertaintyAt(
  transcript: Transcript,
  hit: { utterance_index: number; start_ms: number; end_ms: number },
  limits: ConfidenceLimits,
): Evidence["uncertain"] {
  const utterance = transcript.utterances.find((u) => u.index === hit.utterance_index);
  return utterance ? uncertaintyOf(utterance, hit.start_ms, hit.end_ms, limits) : null;
}

const INTRODUCTION = /\b(i'm|i am|my name is|this is|it's|here's)\b/;

function bindName(
  quote: string,
  name: string,
  quotedBy: string,
  labels: string[],
): string | null {
  if (introduces(quote, name)) return quotedBy;
  if (labels.length === 2 && addresses(quote, name)) {
    return labels.find((label) => label !== quotedBy) ?? null;
  }
  return null;
}

function introduces(quote: string, name: string): boolean {
  const said = normalize(quote);
  const spoken = normalize(name);
  if (!spoken || !said.includes(spoken)) return false;
  return INTRODUCTION.test(said.slice(0, said.indexOf(spoken)));
}

function addresses(quote: string, name: string): boolean {
  const spoken = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!spoken) return false;
  return new RegExp(`(^|[\\s,])${spoken}\\s*[,?!.]`, "i").test(quote.trim());
}

interface Entry<T> {
  deciding_ms: number;
  item: T;
}

function identify<T>(entries: Entry<T>[], prefix: string): (T & { id: string })[] {
  return [...entries]
    .sort((a, b) => a.deciding_ms - b.deciding_ms)
    .map((entry, index) => ({ ...entry.item, id: `${prefix}${index + 1}` }));
}

function resolveAnchor(
  transcriptText: string,
  userAnchorDate: string | null,
  warnings: Set<string>,
): VerifyResult["anchor"] {
  const user = userAnchorDate && ISO_DATE.test(userAnchorDate) ? userAnchorDate : null;
  const spoken = findAnchorDate(transcriptText);

  if (spoken) {
    if (user && user !== spoken) {
      warnings.add("anchor_date_conflict");
      return { date: spoken, source: "recording", ignored: user };
    }
    return { date: spoken, source: "recording", ignored: null };
  }
  if (user) return { date: user, source: "user", ignored: null };
  return { date: null, source: "none", ignored: null };
}

function resolveOwner(
  claimed: string,
  knownNames: string[],
  normalizedTranscript: string,
  warnings: Set<string>,
): Owner {
  const name = claimed.trim();
  if (!name) return { name: null, status: "unassigned", speaker_label: null };

  const normalized = normalize(name);
  const exact = knownNames.find((known) => normalize(known) === normalized);
  if (exact) return { name: exact, status: "named", speaker_label: null };

  const byFirstName = knownNames.find((known) => normalize(known).split(" ")[0] === normalized);
  if (byFirstName) return { name: byFirstName, status: "named", speaker_label: null };

  if (normalizedTranscript.includes(normalized)) {
    return { name, status: "named", speaker_label: null };
  }

  warnings.add("owner_not_a_known_name");
  return { name: null, status: "unassigned", speaker_label: null };
}

const TAKES_ON = /\b(i'll(?! not| never)|i will(?! not| never)|i'm going to|i am going to|let me|leave it with me)\b/;

function ownerByVoice(evidence: Evidence[], names: Record<string, string>): Owner | null {
  for (const item of evidence) {
    if (item.kind !== "acceptance" && item.kind !== "owner") continue;
    if (item.speaker_label === null || !TAKES_ON.test(normalize(item.quote))) continue;
    const name = names[item.speaker_label];
    return name
      ? { name, status: "named", speaker_label: item.speaker_label }
      : { name: null, status: "unnamed_speaker", speaker_label: item.speaker_label };
  }
  return null;
}

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