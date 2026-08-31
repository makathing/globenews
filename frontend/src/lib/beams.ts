import type { NewsEvent } from '../../../shared/news';
import { GLOBE_RADIUS } from './geo';

/**
 * Beam geometry + freshness math. Single source of truth for how an event's
 * data maps onto its light shaft, shared by the scene and the UI rail.
 */

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

export const FRESHNESS_WINDOW_HOURS = 24;

/** Hours since the event was first seen (clamped at 0). */
export function ageHours(event: NewsEvent, now = Date.now()): number {
  return Math.max(0, (now - new Date(event.firstSeen).getTime()) / 3_600_000);
}

/**
 * 1 = brand new, decaying to 0.4 at the end of the 24h window. Drives beam
 * brightness and pulse speed — never height, so the two encodings don't fight.
 */
export function freshness(event: NewsEvent, now = Date.now()): number {
  const t = Math.min(ageHours(event, now) / FRESHNESS_WINDOW_HOURS, 1);
  return 1 - t * 0.6;
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
