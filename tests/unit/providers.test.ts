import { describe, expect, it } from "vitest";
import { fixtureIdFromFilename } from "@/lib/providers";

describe("fixtureIdFromFilename", () => {
  it.each([
    ["meeting-a.mp3", "meeting-a"],
    ["meeting-a.stub.mp3", "meeting-a"],
    ["meeting-a.stub.wav", "meeting-a"],
    ["meeting-c.wav", "meeting-c"],
    ["meeting-b.webm", "meeting-b"],
  ])("maps %s to %s", (filename, id) => {
    expect(fixtureIdFromFilename(filename)).toBe(id);
  });

  it("leaves a name with no extension alone", () => {
    expect(fixtureIdFromFilename("meeting-a")).toBe("meeting-a");
  });
});