import type { NewsDataset } from '../../../shared/news';

/**
 * The timeline, client side: the index of archived days that
 * scripts/copy-data.mjs publishes beside the site, and one day's snapshot.
 * Both are plain static files fetched on demand, never bundled.
 */

export interface ArchiveDay {
  /** UTC day, YYYY-MM-DD. */
  date: string;
  count: number;
  generatedAt: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in YYYY-MM-DD form. */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validated, de-duplicated, newest first; anything malformed is dropped. */
export function parseArchiveIndex(json: unknown): ArchiveDay[] {
  const days = (json as { days?: unknown } | null)?.days;
  if (!Array.isArray(days)) return [];
  const seen = new Set<string>();
  const out: ArchiveDay[] = [];
  for (const raw of days) {
    const day = raw as Partial<ArchiveDay> | null;
    if (!day || !isValidDate(day.date) || seen.has(day.date)) continue;
    if (typeof day.count !== 'number' || typeof day.generatedAt !== 'string') continue;
    seen.add(day.date);
    out.push({ date: day.date, count: day.count, generatedAt: day.generatedAt });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", or "Tue 27 Oct" (all UTC days). */
export function dayLabel(date: string, todayUtc: string): string {
  if (date === todayUtc) return 'Today';
  const d = new Date(`${date}T00:00:00Z`);
  if (Date.parse(`${todayUtc}T00:00:00Z`) - d.getTime() === 86_400_000) return 'Yesterday';
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** "Tue 27 Oct" regardless of today — for banners that must name the day. */
export function longDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

export function utcDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function isDataset(value: unknown): value is NewsDataset {
  const d = value as Partial<NewsDataset> | null;
  return !!d && Array.isArray(d.events) && typeof d.generatedAt === 'string';
}

export async function fetchArchiveIndex(base: string): Promise<ArchiveDay[]> {
  try {
    const res = await fetch(`${base}data/archive/index.json`);
    if (!res.ok) return [];
    return parseArchiveIndex(await res.json());
  } catch {
    return [];
  }
}

/** One archived day, or null when it is missing or malformed. */
export async function fetchArchiveDay(base: string, date: string): Promise<NewsDataset | null> {
  if (!isValidDate(date)) return null;
  try {
    const res = await fetch(`${base}data/archive/${date}.json`);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isDataset(json) ? json : null;
  } catch {
    return null;
  }
}
