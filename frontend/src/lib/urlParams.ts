import { isValidDate } from './archive';
import { isRegionId, type RegionId } from './regions';

/**
 * What the address bar carries: `?event=<id>` (the open story),
 * `?region=<id>` (a region view other than World), `?date=YYYY-MM-DD`
 * (an archived day) and `?q=` (a search). Query params rather than path segments, deliberately:
 * static hosts (GitHub Pages) serve index.html for `/?event=x` without any
 * SPA-fallback configuration. Pure, so it is unit-testable.
 */
export interface UrlState {
  event: string | null;
  region: RegionId | null;
  date: string | null;
  /** A search query over the list. */
  q: string | null;
}

/** The URL's state; values that aren't valid are reported as absent. */
export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const event = params.get('event');
  const region = params.get('region');
  const date = params.get('date');
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  return {
    event: event || null,
    region: isRegionId(region) && region !== 'world' ? region : null,
    date: isValidDate(date) ? date : null,
    q: q || null,
  };
}

/**
 * `href` with the given params set (or removed, for null / World), as a
 * path + query + hash suitable for history.pushState. Other params are kept.
 */
export function writeUrlState(href: string, state: Partial<UrlState>): string {
  const url = new URL(href);
  const put = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  put('region', state.region === 'world' ? null : state.region);
  put('date', state.date);
  put('event', state.event);
  put('q', state.q === undefined ? undefined : state.q?.trim() || null);
  return url.pathname + url.search + url.hash;
}
