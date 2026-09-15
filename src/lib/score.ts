import { normalize } from "./transcript";
import type { CommitmentsDocument } from "./types";

export interface ExpectedDeadline {
  status_any_of?: string[];
  raw_contains?: string[];
  date?: string;
}

export interface ExpectedCommitment {
  key: string;
  title_contains: string[];
  owner?: { name: string | null; status: string };
  deadline?: ExpectedDeadline;
  superseded?: { field: string; old_value_contains: string[] }[];
  evidence_contains?: string;
}

export interface ExpectedExcluded {
  key: string;
  title_contains: string[];
  reason: string;
  evidence_contains?: string;

  evidence_contains_any?: string[];
}

export interface ExpectedOpenQuestion {
  key: string;
  question_contains: string[];
  evidence_contains?: string;
}

export interface ExpectedSet {
  id: string;
  warnings_include?: string[];
  commitments: ExpectedCommitment[];
  excluded: ExpectedExcluded[];
  open_questions: ExpectedOpenQuestion[];
  must_not_appear_in_commitments?: string[][];
}

export interface ScoreReport {
  id: string;
  passed: boolean;
  inclusion_recall: number;
  exclusion_precision: number;
  failures: string[];
  matched: Record<string, string>;
}

function containsAll(haystack: string, needles: string[]): boolean {
  const text = normalize(haystack);
  return needles.every((needle) => text.includes(normalize(needle)));
}

function quotesInclude(
  evidence: { quote: string }[],
  fragment: string | undefined,
  anyOf?: string[],
): boolean {
  const fragments = anyOf ?? (fragment ? [fragment] : []);
  if (fragments.length === 0) return true;
  return fragments.some((candidate) =>
    evidence.some((item) => normalize(item.quote).includes(normalize(candidate))),
  );
}

export function score(document: CommitmentsDocument, expected: ExpectedSet): ScoreReport {
  const failures: string[] = [];
  const matched: Record<string, string> = {};
  const usedCommitments = new Set<string>();

  for (const want of expected.commitments) {
    const hit = document.commitments.find(
      (c) => !usedCommitments.has(c.id) && containsAll(c.title, want.title_contains),
    );
    if (!hit) {
      failures.push(`missing commitment: ${want.key}`);
      continue;
    }
    usedCommitments.add(hit.id);
    matched[want.key] = hit.id;

    if (want.owner) {
      if (hit.owner.status !== want.owner.status) {
        failures.push(
          `${want.key}: owner status ${hit.owner.status}, expected ${want.owner.status}`,
        );
      }
      const wantName = want.owner.name ? normalize(want.owner.name) : null;
      const gotName = hit.owner.name ? normalize(hit.owner.name) : null;
      if (wantName !== gotName) {
        failures.push(`${want.key}: owner ${hit.owner.name ?? "null"}, expected ${want.owner.name ?? "null"}`);
      }
    }

    if (want.deadline) {
      if (want.deadline.status_any_of && !want.deadline.status_any_of.includes(hit.deadline.status)) {
        failures.push(
          `${want.key}: deadline status ${hit.deadline.status}, expected one of ${want.deadline.status_any_of.join("|")}`,
        );
      }
      if (want.deadline.raw_contains && !containsAll(hit.deadline.raw ?? "", want.deadline.raw_contains)) {
        failures.push(`${want.key}: deadline raw "${hit.deadline.raw ?? ""}" misses ${want.deadline.raw_contains.join("+")}`);
      }
      if (want.deadline.date && hit.deadline.date !== want.deadline.date) {
        failures.push(`${want.key}: deadline date ${hit.deadline.date ?? "null"}, expected ${want.deadline.date}`);
      }
    }

    for (const wantOld of want.superseded ?? []) {
      const found = hit.superseded.some(
        (s) => s.field === wantOld.field && containsAll(s.old_value, wantOld.old_value_contains),
      );
      if (!found) failures.push(`${want.key}: missing superseded ${wantOld.field}`);
    }

    if (!quotesInclude(hit.evidence, want.evidence_contains)) {
      failures.push(`${want.key}: no evidence quote contains "${want.evidence_contains}"`);
    }
  }

  const usedExcluded = new Set<string>();
  for (const want of expected.excluded) {
    const hit = document.excluded.find(
      (x) => !usedExcluded.has(x.id) && containsAll(x.title, want.title_contains),
    );
    if (!hit) {
      failures.push(`missing excluded item: ${want.key}`);
      continue;
    }
    usedExcluded.add(hit.id);
    matched[want.key] = hit.id;
    if (hit.reason !== want.reason) {
      failures.push(`${want.key}: reason ${hit.reason}, expected ${want.reason}`);
    }
    if (!quotesInclude(hit.evidence, want.evidence_contains, want.evidence_contains_any)) {
      failures.push(
        `${want.key}: no evidence quote contains ${JSON.stringify(want.evidence_contains_any ?? want.evidence_contains)}`,
      );
    }
  }

  const usedQuestions = new Set<string>();
  for (const want of expected.open_questions) {
    const hit = document.open_questions.find(
      (q) => !usedQuestions.has(q.id) && containsAll(q.question, want.question_contains),
    );
    if (!hit) {
      failures.push(`missing open question: ${want.key}`);
      continue;
    }
    usedQuestions.add(hit.id);
    matched[want.key] = hit.id;
    if (!quotesInclude(hit.evidence, want.evidence_contains)) {
      failures.push(`${want.key}: no evidence quote contains "${want.evidence_contains}"`);
    }
  }

  for (const forbidden of expected.must_not_appear_in_commitments ?? []) {
    const leaked = document.commitments.find((c) => containsAll(c.title, forbidden));
    if (leaked) failures.push(`unsupported commitment present: ${leaked.title}`);
  }

  for (const warning of expected.warnings_include ?? []) {
    if (!document.warnings.includes(warning)) failures.push(`missing warning: ${warning}`);
  }

  const extras = document.commitments.filter((c) => !usedCommitments.has(c.id));
  for (const extra of extras) failures.push(`extra commitment: ${extra.title}`);

  const expectedCount = expected.commitments.length;
  const matchedCount = usedCommitments.size;
  return {
    id: expected.id,
    passed: failures.length === 0,
    inclusion_recall: expectedCount === 0 ? 1 : matchedCount / expectedCount,
    exclusion_precision:
      document.commitments.length === 0 ? 1 : matchedCount / document.commitments.length,
    failures,
    matched,
  };
}