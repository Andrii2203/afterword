import { describe, expect, it } from "vitest";
import { concatWav, durationMs, parseWav, writeWav } from "@/lib/wav";

const FORMAT = { sampleRate: 24_000, channels: 1, bitsPerSample: 16 };

function tone(ms: number, value = 1_000): Buffer {
  const frames = (FORMAT.sampleRate * ms) / 1000;
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) data.writeInt16LE(value, i * 2);
  return writeWav({ ...FORMAT, data });
}

describe("wav", () => {
  it("round-trips a written file", () => {
    const parsed = parseWav(tone(100));
    expect(parsed.sampleRate).toBe(24_000);
    expect(parsed.channels).toBe(1);
    expect(parsed.bitsPerSample).toBe(16);
    expect(durationMs(parsed)).toBe(100);
  });

  it("concatenates segments and inserts the gap", () => {
    const joined = parseWav(concatWav([tone(100), tone(200)], 50));
    expect(durationMs(joined)).toBe(350);
  });

  it("produces byte-identical output for identical input", () => {
    expect(concatWav([tone(40), tone(60)], 10).equals(concatWav([tone(40), tone(60)], 10))).toBe(
      true,
    );
  });

  it("refuses segments with different formats", () => {
    const other = writeWav({ ...FORMAT, sampleRate: 16_000, data: Buffer.alloc(320) });
    expect(() => concatWav([tone(50), other])).toThrow(/one PCM format/);
  });

  it("refuses a file that is not RIFF", () => {
    expect(() => parseWav(Buffer.from("not audio at all"))).toThrow(/RIFF/);
  });
});