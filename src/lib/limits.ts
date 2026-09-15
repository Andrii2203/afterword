/**
 * Best-effort spending guard for a public demo (ADR-0022).
 *
 * Every run costs about five cents of provider credit, so an open URL is an open
 * wallet. The counters live in the process, which means a serverless deployment
 * enforces them per instance, not globally; that is a deliberate floor, not a
 * claim of exactness.
 */
export interface LimitConfig {
  perClientPerHour: number;
  perProcessPerDay: number;
}

export const DEFAULT_LIMITS: LimitConfig = {
  perClientPerHour: Number(process.env.RUNS_PER_CLIENT_PER_HOUR ?? 12),
  perProcessPerDay: Number(process.env.RUNS_PER_DAY ?? 200),
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface LimitDecision {
  allowed: boolean;
  reason?: string;
  retry_after_seconds?: number;
}

export class RunLimiter {
  private readonly perClient = new Map<string, number[]>();
  private day: number[] = [];

  constructor(private readonly config: LimitConfig = DEFAULT_LIMITS) {}

  /** Clears every counter; used by tests so one suite cannot exhaust the next. */
  reset(): void {
    this.perClient.clear();
    this.day = [];
  }

  check(client: string, now = Date.now()): LimitDecision {
    this.day = this.day.filter((at) => now - at < DAY_MS);
    if (this.day.length >= this.config.perProcessPerDay) {
      return {
        allowed: false,
        reason: "This demo has reached its daily processing budget; try again tomorrow.",
        retry_after_seconds: Math.ceil((DAY_MS - (now - this.day[0])) / 1000),
      };
    }

    const recent = (this.perClient.get(client) ?? []).filter((at) => now - at < HOUR_MS);
    if (recent.length >= this.config.perClientPerHour) {
      this.perClient.set(client, recent);
      return {
        allowed: false,
        reason: `You have processed ${recent.length} recordings in the last hour; the demo allows ${this.config.perClientPerHour}.`,
        retry_after_seconds: Math.ceil((HOUR_MS - (now - recent[0])) / 1000),
      };
    }

    recent.push(now);
    this.perClient.set(client, recent);
    this.day.push(now);
    return { allowed: true };
  }
}

/** The client identity available on a request, with a stable fallback. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export const limiter = new RunLimiter();
