// Pure helpers for the timeline: which archived daily snapshots ship with the
// site, and the small index the client reads to draw its day chips. Used by
// copy-data.mjs; kept free of fs so it is unit-testable.

const DAILY = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** Days kept: the newest snapshot and the 29 days before it. */
export const MAX_DAYS = 30;

/**
 * The daily snapshot files to publish, newest first. Only `YYYY-MM-DD.json`:
 * the US & state run's `YYYY-MM-DD-us.json` (and anything else in the folder)
 * is not a whole-world day and stays out of the timeline.
 */
export function planArchive(filenames, { maxDays = MAX_DAYS } = {}) {
  const dates = [];
  for (const name of filenames) {
    const match = DAILY.exec(name);
    if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) continue;
    dates.push(match[1]);
  }
  dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (dates.length === 0) return [];
  const cutoff = Date.parse(`${dates[0]}T00:00:00Z`) - (maxDays - 1) * 86_400_000;
  return dates
    .filter((date) => Date.parse(`${date}T00:00:00Z`) >= cutoff)
    .map((date) => ({ date, file: `${date}.json` }));
}

/** One index entry for a snapshot, or null when it isn't a dataset. */
export function indexEntry(date, dataset) {
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.events)) return null;
  if (typeof dataset.generatedAt !== 'string' || Number.isNaN(Date.parse(dataset.generatedAt))) return null;
  return { date, count: dataset.events.length, generatedAt: dataset.generatedAt };
}

/** The published index: `{ days: [{ date, count, generatedAt }] }`, newest first. */
export function buildArchiveIndex(entries) {
  const days = entries.filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { days };
}
