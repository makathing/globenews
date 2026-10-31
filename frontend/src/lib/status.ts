import type { NewsDataset } from '../../../shared/news';

/**
 * The live status line: what the map is showing, and when the site last
 * checked for something newer. "Updated 14h ago" read as stale even when the
 * check a minute earlier had confirmed it was the latest briefing.
 */

function hhmm(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today's briefing · 06:23 UTC", "Breaking update · 14:30 UTC", "Briefing Thu 29 Oct · 06:23 UTC". */
export function briefingLabel(dataset: Pick<NewsDataset, 'generatedAt' | 'mode'>, now = Date.now()): string {
  const generated = new Date(dataset.generatedAt);
  if (Number.isNaN(generated.getTime())) return 'Briefing';
  const time = `${hhmm(dataset.generatedAt)} UTC`;
  const today = new Date(now).toISOString().slice(0, 10) === dataset.generatedAt.slice(0, 10);
  if (today) return `${dataset.mode === 'breaking' ? 'Breaking update' : "Today's briefing"} · ${time}`;
  const day = `${WEEKDAY[generated.getUTCDay()]} ${generated.getUTCDate()} ${MONTH[generated.getUTCMonth()]}`;
  return `${dataset.mode === 'breaking' ? 'Breaking update' : 'Briefing'} ${day} · ${time}`;
}

/** "checked just now", "checked 3 min ago", "checked 2 h ago"; '' before the first check. */
export function checkedLabel(checkedAt: number | null, now = Date.now()): string {
  if (checkedAt === null) return '';
  const minutes = Math.floor(Math.max(0, now - checkedAt) / 60_000);
  if (minutes < 1) return 'checked just now';
  if (minutes < 60) return `checked ${minutes} min ago`;
  return `checked ${Math.floor(minutes / 60)} h ago`;
}
