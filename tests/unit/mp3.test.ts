import { describe, expect, it } from "vitest";
import { encodeMp3 } from "@/lib/mp3";
import type { WavAudio } from "@/lib/wav";

function tone(seconds: number, sampleRate = 24_000): WavAudio {
  const frames = seconds * sampleRate;
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    data.writeInt16LE(Math.round(3_000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)), i * 2);
  }
  return { sampleRate, channels: 1, bitsPerSample: 16, data };
}

describe("encodeMp3", () => {
  it("produces a stream that starts with an MP3 frame header", async () => {
    const mp3 = await encodeMp3(tone(1));
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
  });

  it("is far smaller than the PCM it came from", async () => {
    const source = tone(2);
    const mp3 = await encodeMp3(source);
    expect(mp3.length).toBeLessThan(source.data.length / 5);
    expect(mp3.length).toBeGreaterThan(1_000);
  });

  it("keeps a three minute recording inside the 4.5 MB request limit", async () => {
    const perSecond = (await encodeMp3(tone(2))).length / 2;
    expect(perSecond * 180).toBeLessThan(4_500_000);
  });

  it("is deterministic for identical input", async () => {
    expect((await encodeMp3(tone(1))).equals(await encodeMp3(tone(1)))).toBe(true);
  });

  it("refuses anything that is not 16-bit mono", async () => {
    await expect(encodeMp3({ ...tone(1), bitsPerSample: 8 })).rejects.toThrow(/16-bit/);
    await expect(encodeMp3({ ...tone(1), channels: 2 })).rejects.toThrow(/mono/);
  });
});
