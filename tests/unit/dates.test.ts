import { describe, expect, it } from "vitest";
import { findAnchorDate, resolveRelative } from "@/lib/dates";

describe("findAnchorDate", () => {
  it("reads a numeric month-day-year date", () => {
    expect(findAnchorDate("Okay, today is March 2, 2026, let's start.")).toBe("2026-03-02");
  });

  it("reads an ordinal month-day-year date", () => {
    expect(findAnchorDate("Today is Monday, March 2nd, 2026.")).toBe("2026-03-02");
  });

  it("reads a spelled-out date as produced by speech recognition", () => {
    expect(findAnchorDate("today is Monday, March second, twenty twenty six")).toBe(
      "2026-03-02",
    );
  });

  it("reads an ISO date", () => {
    expect(findAnchorDate("The anchor is 2026-03-02 for this call.")).toBe("2026-03-02");
  });

  it("reads the US written form that speech recognition produces", () => {
    expect(findAnchorDate("I'm Maya Chen, and today is Monday, 03/02/2026.")).toBe("2026-03-02");
    expect(findAnchorDate("today is 3/2/2026")).toBe("2026-03-02");
  });

  it("returns null when the first component cannot be a month", () => {
    expect(findAnchorDate("reference number 13/02/2026 was filed")).toBeNull();
  });

  it("returns null when only weekdays are mentioned", () => {
    expect(findAnchorDate("Let's do it by Thursday, before the release.")).toBeNull();
  });

  it("returns null when a month has no year", () => {
    expect(findAnchorDate("We shipped in March, it was fine.")).toBeNull();
  });
});

describe("resolveRelative", () => {
  const monday = "2026-03-02";

  it("resolves today", () => {
    expect(resolveRelative("today", monday)).toBe("2026-03-02");
  });

  it("resolves tomorrow", () => {
    expect(resolveRelative("by tomorrow", monday)).toBe("2026-03-03");
  });

  it("resolves the day after tomorrow", () => {
    expect(resolveRelative("the day after tomorrow", monday)).toBe("2026-03-04");
  });

  it("resolves in N days", () => {
    expect(resolveRelative("in 3 days", monday)).toBe("2026-03-05");
    expect(resolveRelative("in two days", monday)).toBe("2026-03-04");
  });

  it("resolves a bare weekday to the next occurrence", () => {
    expect(resolveRelative("by Friday", monday)).toBe("2026-03-06");
    expect(resolveRelative("Monday", monday)).toBe("2026-03-09");
  });

  it("resolves this weekday", () => {
    expect(resolveRelative("by this Friday", monday)).toBe("2026-03-06");
  });

  it("resolves end of the week to Friday of the anchor week", () => {
    expect(resolveRelative("by the end of the week", monday)).toBe("2026-03-06");
    expect(resolveRelative("end of this week", "2026-03-05")).toBe("2026-03-06");
  });

  it("leaves end of the week unresolved on a weekend anchor", () => {
    expect(resolveRelative("by the end of the week", "2026-03-07")).toBeNull();
  });

  it("leaves next-week expressions unresolved", () => {
    expect(resolveRelative("by next Friday", monday)).toBeNull();
    expect(resolveRelative("next week", monday)).toBeNull();
    expect(resolveRelative("by the end of next week", monday)).toBeNull();
  });

  it("leaves event-relative expressions unresolved", () => {
    expect(resolveRelative("before the release", monday)).toBeNull();
    expect(resolveRelative("after the call", monday)).toBeNull();
  });

  it("returns null without an anchor date", () => {
    expect(resolveRelative("by Friday", null)).toBeNull();
  });

  it("returns null for an empty expression", () => {
    expect(resolveRelative("", monday)).toBeNull();
  });
});