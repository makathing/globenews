/**
 * How long a story stays on the map. Shared by the pipeline (which decides
 * what to carry from one run to the next) and the frontend (which fades a
 * story over the same span), so the two can never disagree about when a
 * story is old.
 *
 * Severity-scaled: a minor regional item is gone tomorrow, a historic event
 * stays a week. Re-reporting a story resets its clock without changing when
 * it was first added. Dependency-free on purpose, like news.ts.
 */

export const LIFETIME_HOURS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 24,
  2: 36,
  3: 48,
  4: 96,
  5: 168,
};

const HOUR_MS = 3_600_000;

/** Lifetime for a severity; out-of-range or missing severity gets the middle value. */
export function lifetimeHours(severity: number): number {
  if (!Number.isFinite(severity)) return LIFETIME_HOURS[3];
  const clamped = Math.min(5, Math.max(1, Math.round(severity))) as 1 | 2 | 3 | 4 | 5;
  return LIFETIME_HOURS[clamped];
}

/** The minimum an event needs to carry for its expiry to be known. */
export interface Retainable {
  severity: number;
  lastUpdated: string;
  /** ISO timestamp written by the pipeline; absent on datasets from before retention existed. */
  expiresAt?: string;
}

/** When the story leaves the map, as epoch ms. Derived when the file predates `expiresAt`. */
export function expiryOf(event: Retainable): number {
  if (event.expiresAt) {
    const stamped = Date.parse(event.expiresAt);
    if (!Number.isNaN(stamped)) return stamped;
  }
  return Date.parse(event.lastUpdated) + lifetimeHours(event.severity) * HOUR_MS;
}

export function expiryIso(severity: number, lastUpdated: string): string {
  return new Date(Date.parse(lastUpdated) + lifetimeHours(severity) * HOUR_MS).toISOString();
}

export function isExpired(event: Retainable, now: number = Date.now()): boolean {
  return expiryOf(event) <= now;
}
