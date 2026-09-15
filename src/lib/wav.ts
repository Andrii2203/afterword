/**
 * Minimal PCM WAV reader and writer, used to assemble fixture audio from
 * text-to-speech segments without an external binary (ADR-0013).
 */

export interface WavAudio {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  data: Buffer;
}

export function parseWav(buffer: Buffer): WavAudio {
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Not a RIFF file.");
  }
  if (buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAVE file.");

  let offset = 12;
  let format: { sampleRate: number; channels: number; bitsPerSample: number } | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") {
      format = {
        channels: body.readUInt16LE(2),
        sampleRate: body.readUInt32LE(4),
        bitsPerSample: body.readUInt16LE(14),
      };
    } else if (id === "data") {
      data = Buffer.from(body);
    }
    offset += 8 + size + (size % 2);
  }

  if (!format || !data) throw new Error("The file has no fmt or data chunk.");
  return { ...format, data };
}

export function writeWav(audio: WavAudio): Buffer {
  const byteRate = (audio.sampleRate * audio.channels * audio.bitsPerSample) / 8;
  const blockAlign = (audio.channels * audio.bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + audio.data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(audio.channels, 22);
  header.writeUInt32LE(audio.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(audio.bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(audio.data.length, 40);

  return Buffer.concat([header, audio.data]);
}

export function silence(audio: Omit<WavAudio, "data">, ms: number): Buffer {
  const frames = Math.round((audio.sampleRate * ms) / 1000);
  return Buffer.alloc((frames * audio.channels * audio.bitsPerSample) / 8);
}

/** Concatenate segments that share one PCM format, inserting a gap between them. */
export function concatWav(segments: Buffer[], gapMs = 0): Buffer {
  if (segments.length === 0) throw new Error("Nothing to concatenate.");
  const parsed = segments.map(parseWav);
  const first = parsed[0];
  for (const part of parsed) {
    if (
      part.sampleRate !== first.sampleRate ||
      part.channels !== first.channels ||
      part.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error("Segments do not share one PCM format.");
    }
  }

  const gap = gapMs > 0 ? silence(first, gapMs) : Buffer.alloc(0);
  const body: Buffer[] = [];
  parsed.forEach((part, index) => {
    if (index > 0 && gap.length > 0) body.push(gap);
    body.push(part.data);
  });

  return writeWav({ ...first, data: Buffer.concat(body) });
}

export function durationMs(audio: WavAudio): number {
  const bytesPerFrame = (audio.channels * audio.bitsPerSample) / 8;
  return Math.round((audio.data.length / bytesPerFrame / audio.sampleRate) * 1000);
}
