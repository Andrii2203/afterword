import { describe, expect, it } from "vitest";
import { RunLimiter, clientKey } from "@/lib/limits";

const config = { perClientPerHour: 3, perProcessPerDay: 5 };

describe("RunLimiter", () => {
  it("allows runs up to the hourly client limit", () => {
    const limiter = new RunLimiter(config);
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check("1.2.3.4", 1_000 + i).allowed).toBe(true);
    }
    expect(limiter.check("1.2.3.4", 1_100).allowed).toBe(false);
  });

  it("counts each client separately", () => {
    const limiter = new RunLimiter(config);
    for (let i = 0; i < 3; i += 1) limiter.check("1.2.3.4", 1_000 + i);
    expect(limiter.check("5.6.7.8", 1_100).allowed).toBe(true);
  });

  it("forgets a client run after an hour", () => {
    const limiter = new RunLimiter(config);
    for (let i = 0; i < 3; i += 1) limiter.check("1.2.3.4", 1_000 + i);
    const later = 1_000 + 60 * 60 * 1000 + 1;
    expect(limiter.check("1.2.3.4", later).allowed).toBe(true);
  });

  it("stops the whole process at the daily budget", () => {
    const limiter = new RunLimiter(config);
    for (let i = 0; i < 3; i += 1) limiter.check("a", 1_000 + i);
    for (let i = 0; i < 2; i += 1) limiter.check("b", 1_000 + i);
    const decision = limiter.check("c", 1_100);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/daily processing budget/);
  });

  it("reports when the caller may retry", () => {
    const limiter = new RunLimiter(config);
    for (let i = 0; i < 3; i += 1) limiter.check("1.2.3.4", 1_000);
    const decision = limiter.check("1.2.3.4", 1_000 + 60_000);
    expect(decision.retry_after_seconds).toBe(3540);
  });
});

describe("clientKey", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://localhost/api/process", { headers });

  it("takes the first entry of x-forwarded-for", () => {
    expect(clientKey(request({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(request({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("returns a stable value when no address is present", () => {
    expect(clientKey(request({}))).toBe("unknown");
  });
});