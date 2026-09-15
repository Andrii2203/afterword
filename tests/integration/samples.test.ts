import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/pipeline";

const SAMPLES = join(process.cwd(), "public", "samples");

describe("bundled sample recordings", () => {
  const files = readdirSync(SAMPLES);

  it("ships the three fixtures", () => {
    expect(files.sort()).toEqual(["meeting-a.mp3", "meeting-b.mp3", "meeting-c.mp3"]);
  });

  it.each(files)("%s is inside the upload limit", (file) => {
    expect(statSync(join(SAMPLES, file)).size).toBeLessThan(MAX_UPLOAD_BYTES);
  });

  it.each(files)("%s is a compressed format", (file) => {
    expect(file).toMatch(/\.(mp3|m4a|ogg|webm)$/);
  });
});