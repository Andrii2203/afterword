import { z } from "zod";

export const WordSchema = z.object({
  text: z.string(),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
});

export const UtteranceSchema = z.object({
  index: z.number().int().nonnegative(),
  speaker_label: z.string(),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
  text: z.string(),
  words: z.array(WordSchema),
});

export const TranscriptSchema = z.object({
  audio_ms: z.number().int().nonnegative(),
  utterances: z.array(UtteranceSchema),
});

export type Word = z.infer<typeof WordSchema>;
export type Utterance = z.infer<typeof UtteranceSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

export const EVIDENCE_KINDS = [
  "acceptance",
  "owner",
  "deadline",
  "correction",
  "cancellation",
  "mention",
] as const;

export const EXCLUSION_REASONS = ["never_accepted", "cancelled", "ambiguous"] as const;

export const SUPERSEDED_FIELDS = ["deadline", "owner", "title"] as const;

export const LlmEvidenceSchema = z.object({
  utterance_index: z.number().int().nonnegative(),
  quote: z.string(),
  kind: z.enum(EVIDENCE_KINDS),
});

export const LlmCommitmentSchema = z.object({
  title: z.string(),
  owner_name: z.string(),
  deadline_raw: z.string(),
  deadline_kind: z.enum(["relative", "absolute", "none"]),
  deadline_absolute: z.string(),
  evidence: z.array(LlmEvidenceSchema),
  superseded: z.array(
    z.object({
      field: z.enum(SUPERSEDED_FIELDS),
      old_value: z.string(),
      utterance_index: z.number().int().nonnegative(),
      quote: z.string(),
    }),
  ),
});

export const LlmExcludedSchema = z.object({
  title: z.string(),
  reason: z.enum(EXCLUSION_REASONS),
  evidence: z.array(LlmEvidenceSchema),
});

export const LlmOpenQuestionSchema = z.object({
  question: z.string(),
  raised_by: z.string(),
  evidence: z.array(LlmEvidenceSchema),
});

export const LlmSpeakerSchema = z.object({
  speaker_label: z.string(),
  name: z.string(),
  utterance_index: z.number().int().nonnegative(),
  quote: z.string(),
});

export const LlmOutputSchema = z.object({
  anchor_date: z.string(),
  speakers: z.array(LlmSpeakerSchema),
  commitments: z.array(LlmCommitmentSchema),
  excluded: z.array(LlmExcludedSchema),
  open_questions: z.array(LlmOpenQuestionSchema),
});

export type LlmEvidence = z.infer<typeof LlmEvidenceSchema>;
export type LlmCommitment = z.infer<typeof LlmCommitmentSchema>;
export type LlmExcluded = z.infer<typeof LlmExcludedSchema>;
export type LlmOpenQuestion = z.infer<typeof LlmOpenQuestionSchema>;
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

export const WARNING_CODES = [
  "missing_date_context",
  "evidence_unverified",
  "owner_not_a_known_name",
  "speaker_unnamed",
  "llm_retry",
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

export const EvidenceSchema = z.object({
  speaker: z.string().nullable(),
  quote: z.string(),
  kind: z.enum(EVIDENCE_KINDS),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
  utterance_index: z.number().int().nonnegative(),
});

export const OwnerSchema = z.object({
  name: z.string().nullable(),
  status: z.enum(["named", "unassigned"]),
});

export const DeadlineSchema = z.object({
  raw: z.string().nullable(),
  date: z.string().nullable(),
  status: z.enum(["resolved", "unresolved_relative", "none"]),
});

export const CommitmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: OwnerSchema,
  deadline: DeadlineSchema,
  evidence: z.array(EvidenceSchema).min(1),
  superseded: z.array(
    z.object({
      field: z.enum(SUPERSEDED_FIELDS),
      old_value: z.string(),
      evidence: EvidenceSchema,
    }),
  ),
});

export const ExcludedSchema = z.object({
  id: z.string(),
  title: z.string(),
  reason: z.enum(EXCLUSION_REASONS),
  evidence: z.array(EvidenceSchema).min(1),
});

export const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  raised_by: z.string().nullable(),
  evidence: z.array(EvidenceSchema).min(1),
});

export const SpeakerSchema = z.object({
  label: z.string(),
  name: z.string().nullable(),
  evidence: EvidenceSchema.nullable(),
});

export const MetricsSchema = z.object({
  audio_seconds: z.number(),
  asr_ms: z.number().int(),
  llm_ms: z.number().int(),
  total_ms: z.number().int(),
  asr_cost_usd: z.number(),
  llm_cost_usd: z.number(),
  cost_per_audio_minute_usd: z.number(),
  tokens: z.object({
    input: z.number().int(),
    output: z.number().int(),
    retries: z.number().int(),
  }),
  models: z.object({ asr: z.string(), llm: z.string() }),
});

export const DocumentSchema = z.object({
  meta: z.object({
    run_id: z.string(),
    created_at: z.string(),
    audio_ms: z.number().int(),
    filename: z.string(),
    anchor_date: z.string().nullable(),
    anchor_date_source: z.enum(["recording", "user", "none"]),
  }),
  speakers: z.array(SpeakerSchema),
  commitments: z.array(CommitmentSchema),
  excluded: z.array(ExcludedSchema),
  open_questions: z.array(OpenQuestionSchema),
  transcript: TranscriptSchema,
  metrics: MetricsSchema,
  warnings: z.array(z.string()),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Owner = z.infer<typeof OwnerSchema>;
export type Deadline = z.infer<typeof DeadlineSchema>;
export type Commitment = z.infer<typeof CommitmentSchema>;
export type Excluded = z.infer<typeof ExcludedSchema>;
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;
export type Speaker = z.infer<typeof SpeakerSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type CommitmentsDocument = z.infer<typeof DocumentSchema>;