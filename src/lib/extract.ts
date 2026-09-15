import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PRICING } from "@/config/pricing";
import { renderTranscript } from "./transcript";
import { LlmOutputSchema, type LlmOutput, type Transcript } from "./types";

export interface ExtractInput {
  transcript: Transcript;
  names?: Record<string, string>;
}

export interface ExtractResult {
  output: LlmOutput;
  ms: number;
  tokens: { input: number; output: number; retries: number };
}

export interface Extractor {
  readonly model: string;
  extract(input: ExtractInput): Promise<ExtractResult>;
}

export const SYSTEM_PROMPT = `You read a transcript of one recorded project discussion and report the state of every task at the moment the recording ends.

The transcript is a numbered list of utterances in the form: [index] speaker clock | text.

Report a task as a commitment only when someone explicitly states it will be done: the prospective owner accepting it, or the other speaker stating it on that person's behalf without contradiction.
Report a task in "excluded" with reason "never_accepted" when it was only suggested, considered or listed as an idea.
Acceptance and ownership are independent: a task both speakers agree will be done is a commitment even when nobody is named to do it, and it is reported with an empty owner_name rather than as excluded.
Use "never_accepted" for work that was not agreed, never for work that was agreed while only the owner stayed undecided.
Report a task in "excluded" with reason "cancelled" when it was agreed earlier and a later utterance says it will not be done.
Report a task in "excluded" with reason "ambiguous" when acceptance was hedged, for example "maybe", "I might" or "ask me again", and add an open question naming the undecided point.
Report a question in "open_questions" when it is asked in the recording and receives no explicit answer before the recording ends.

Field rules:
- title: one imperative sentence of at most 100 characters describing the action.
- owner_name: the person who will do the work, copied from the recording, or an empty string when nobody was named; never guess an owner from context, role or who spoke.
- deadline_raw: the time expression exactly as spoken, for example "by the end of the week", or an empty string when no deadline was stated.
- deadline_kind: "absolute" only when a full calendar date was spoken, "relative" for every other time expression, "none" when no deadline was stated.
- deadline_absolute: a YYYY-MM-DD date only when deadline_kind is "absolute", otherwise an empty string.
- anchor_date: the calendar date of the meeting as YYYY-MM-DD only when a full date including the year is spoken, otherwise an empty string.
- superseded: one entry for every value that was stated and then replaced, holding the replaced value and the utterance that stated it.

When a value is stated more than once, the commitment must hold the last stated value and the earlier value belongs in superseded.

Evidence rules:
- every item needs at least one evidence entry;
- quote must be copied character for character from the text of a single utterance and must not span two utterances;
- utterance_index must be the index of the utterance the quote was copied from;
- prefer the utterance that decides the item: the acceptance, the cancellation or the correction.

Report nothing that is not stated in the transcript, and do not report greetings, agenda statements or closing remarks as tasks.`;

export function createAnthropicExtractor(options: { model?: string } = {}): Extractor {
  const model = options.model ?? PRICING.llm.model;
  const client = new Anthropic();

  return {
    model,
    async extract({ transcript, names }) {
      const started = Date.now();
      const tokens = { input: 0, output: 0, retries: 0 };
      const user = `Transcript:\n${renderTranscript(transcript, names ?? {})}`;

      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const message = await client.beta.messages.parse({
          model,
          max_tokens: 16_000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: user }],
          output_config: { format: betaZodOutputFormat(LlmOutputSchema) },
        });

        tokens.input += message.usage.input_tokens;
        tokens.output += message.usage.output_tokens;

        if (message.stop_reason === "refusal") {
          throw new Error("The model declined to process this recording.");
        }

        const parsed = LlmOutputSchema.safeParse(message.parsed_output);
        if (parsed.success) {
          return { output: parsed.data, ms: Date.now() - started, tokens };
        }
        lastError = parsed.error;
        tokens.retries += 1;
      }

      throw new Error(`The model returned an unusable document: ${String(lastError)}`);
    },
  };
}
