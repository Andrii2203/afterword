/**
 * Verify that both provider keys work, with the smallest possible billable call.
 *
 * Usage: npm run check:keys
 */
import "./env";
import Anthropic from "@anthropic-ai/sdk";
import { PRICING } from "../src/config/pricing";
import { createDeepgramAsr } from "../src/lib/asr";
import { writeWav } from "../src/lib/wav";

function oneSecondOfTone(): Uint8Array {
  const sampleRate = 8_000;
  const data = Buffer.alloc(sampleRate * 2);
  for (let i = 0; i < sampleRate; i += 1) {
    data.writeInt16LE(Math.round(4_000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)), i * 2);
  }
  return new Uint8Array(writeWav({ sampleRate, channels: 1, bitsPerSample: 16, data }));
}

async function checkDeepgram(): Promise<boolean> {
  try {
    const result = await createDeepgramAsr().transcribe(oneSecondOfTone(), "audio/wav");
    console.log(
      `deepgram  OK   model ${PRICING.asr.model}, ${result.ms} ms, ${result.transcript.utterances.length} utterances in a 1 s tone`,
    );
    return true;
  } catch (error) {
    console.error(`deepgram  FAIL ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function checkAnthropic(): Promise<boolean> {
  try {
    const started = Date.now();
    const message = await new Anthropic().messages.create({
      model: PRICING.llm.model,
      max_tokens: 16,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });
    const text = message.content.find((block) => block.type === "text");
    console.log(
      `anthropic OK   model ${message.model}, ${Date.now() - started} ms, ${message.usage.input_tokens}/${message.usage.output_tokens} tokens, said "${text?.type === "text" ? text.text.trim() : ""}"`,
    );
    return true;
  } catch (error) {
    console.error(`anthropic FAIL ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main(): Promise<void> {
  const results = await Promise.all([checkDeepgram(), checkAnthropic()]);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}

void main();
