import type { NewsEvent } from '../../../shared/news';
import { expiryOf } from '../../../shared/retention';
import { GLOBE_RADIUS } from './geo';

/**
 * Beam geometry + freshness math. Single source of truth for how an event's
 * data maps onto its light shaft, shared by the scene and the UI rail.
 */

/**
 * Severity ramp. Markers share one family rather than eight category hues:
 * from orbit the question people scan for is "how bad, and where", which is
 * ordinal — category is answered by the rail icons once you're reading.
 *
 * That family is warm, and deliberately so. The ramp used to be blue-to-cyan,
 * which put the markers in the same hue as every globe theme — worst of all
 * on Blueprint, where a beam and the ocean beneath it were the same colour.
 * Warm is the complement of every planet we draw, so a marker separates from
 * the map whatever theme is on.
 *
 * It climbs in luminance as it heats up, so the most severe events are also
 * the most visible against a dark globe, and it stops short of white at the
 * top — pure white stays reserved for the breaking-news strobe.
 */
export const SEVERITY_COLORS: Record<number, string> = {
  1: '#c06a35', // ember
  2: '#e08640', // burnt orange
  3: '#ff9f45', // orange
  4: '#ffbe5c', // amber
  5: '#ffdd8f', // bright gold
};

export function beamColor(event: Pick<NewsEvent, 'severity'>): string {
  return SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS[3];
}

/** Severity 1-5 -> beam height in globe radii. Height encodes severity ONLY. */
export function beamHeight(severity: number): number {
  return GLOBE_RADIUS * (0.05 + severity * 0.049);
}

/** Shaft half-width in globe radii; taller beams are slightly wider. */
export function beamWidth(severity: number): number {
  return GLOBE_RADIUS * (0.015 + severity * 0.0042);
}

/** Energy-pulse travel rate, mildly severity-scaled. */
export function beamRate(severity: number): number {
  return 0.26 + severity * 0.05;
}

/** Hours since the event was first seen (clamped at 0). */
export function ageHours(event: NewsEvent, now = Date.now()): number {
  return Math.max(0, (now - new Date(event.firstSeen).getTime()) / 3_600_000);
}

/**
 * 1 when the story was last reported, decaying to 0.4 as it reaches the end
 * of its severity-scaled lifetime (shared/retention.ts) — so a week-long
 * story fades over the week and brightens again when it is re-reported.
 * Drives beam brightness and pulse speed — never height, so the two
 * encodings don't fight.
 */
export function freshness(event: NewsEvent, now = Date.now()): number {
  const updated = Date.parse(event.lastUpdated);
  const span = Math.max(expiryOf(event) - updated, 3_600_000);
  const t = Math.min(Math.max((now - updated) / span, 0), 1);
  return 1 - t * 0.6;
}

/**
 * `freshness` with its timestamps parsed once. Every marker calls this every
 * frame, so the per-frame path should not be re-parsing two ISO strings per
 * story per frame.
 */
export function freshnessClock(event: NewsEvent): (now: number) => number {
  const updated = Date.parse(event.lastUpdated);
  const span = Math.max(expiryOf(event) - updated, 3_600_000);
  return (now) => 1 - Math.min(Math.max((now - updated) / span, 0), 1) * 0.6;
}

/** Compact relative time for rail cards: "just now", "3h ago", "2d ago". */
export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Events first seen within the last hour get a NEW marker. */
export function isNew(event: NewsEvent, now = Date.now()): boolean {
  return ageHours(event, now) < 1;
}

/** A story that was already on the map and was re-reported in the last six hours. */
export function isUpdated(event: NewsEvent, now = Date.now()): boolean {
  return (
    event.lastUpdated !== event.firstSeen &&
    now - Date.parse(event.lastUpdated) < 6 * 3_600_000
  );
}
