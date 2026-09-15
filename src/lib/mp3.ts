import type { WavAudio } from "./wav";

interface Encoder {
  encodeBuffer(samples: Int16Array): Uint8Array;
  flush(): Uint8Array;
}

type LameModule = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Encoder;
};

async function loadEncoder(): Promise<LameModule> {
  const loaded = await import("@breezystack/lamejs");
  return ((loaded as { default?: LameModule }).default ?? loaded) as LameModule;
}

export async function encodeMp3(audio: WavAudio, kbps = 48): Promise<Buffer> {
  if (audio.bitsPerSample !== 16) throw new Error("Only 16-bit PCM can be encoded.");
  if (audio.channels !== 1) throw new Error("Only mono audio can be encoded.");

  const samples = new Int16Array(
    audio.data.buffer.slice(audio.data.byteOffset, audio.data.byteOffset + audio.data.byteLength),
  );
  const lame = await loadEncoder();
  const encoder = new lame.Mp3Encoder(1, audio.sampleRate, kbps);
  const chunks: Uint8Array[] = [];

  const frame = 1152;
  for (let offset = 0; offset < samples.length; offset += frame) {
    const block = encoder.encodeBuffer(samples.subarray(offset, offset + frame));
    if (block.length > 0) chunks.push(block);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}