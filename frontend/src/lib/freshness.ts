import type { NewsEvent } from '../../../shared/news';
import { expiryOf } from '../../../shared/retention';

/**
 * Story age and freshness, shared by the rail cards and the "updated" stamp.
 */

/** Hours since the event was first seen (clamped at 0). */
export function ageHours(event: NewsEvent, now = Date.now()): number {
  return Math.max(0, (now - new Date(event.firstSeen).getTime()) / 3_600_000);
}

/**
 * 1 when the story was last reported, decaying to 0.4 as it reaches the end
 * of its severity-scaled lifetime (shared/retention.ts) — so a week-long
 * story fades over the week and brightens again when it is re-reported.
 * Older cards recede in the rail by it.
 */
export function freshness(event: NewsEvent, now = Date.now()): number {
  const updated = Date.parse(event.lastUpdated);
  const span = Math.max(expiryOf(event) - updated, 3_600_000);
  const t = Math.min(Math.max((now - updated) / span, 0), 1);
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

/** A story that was already on the map and was re-reported in the last six hours. */
export function isUpdated(event: NewsEvent, now = Date.now()): boolean {
  return (
    event.lastUpdated !== event.firstSeen &&
    now - Date.parse(event.lastUpdated) < 6 * 3_600_000
  );
}
