import bundled from '../../../data/events.json';
import type { NewsDataset } from '../../../shared/news';

/**
 * The stories, compiled into the bundle rather than fetched beside it.
 *
 * They used to be a runtime `fetch` of data/events.json. Vite content-hashes
 * every asset it emits, so a new build always wins — but that JSON kept its
 * filename forever, which made it the one thing a browser could serve stale
 * indefinitely. In practice that is exactly what happened: UI changes shipped
 * in hashed JS reached people, and the news sitting behind the unhashed URL
 * did not. Importing it puts the data inside the hashed bundle, so there is
 * one cache surface for the whole app instead of two, and it is the surface
 * that demonstrably works.
 *
 * It costs about 20KB gzipped and saves a round trip on first paint.
 */
export const BUNDLED_DATASET = bundled as unknown as NewsDataset;

/**
 * The same file, still served, still the freshest thing we have — used to
 * refresh a tab that has been left open past the next pipeline run. Cache
 * headers are not ours to set on GitHub Pages, so the URL carries a stamp
 * and the request refuses the cache outright.
 */
export async function fetchLatestDataset(base: string): Promise<NewsDataset | null> {
  try {
    const res = await fetch(`${base}data/events.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as NewsDataset;
  } catch {
    return null;
  }
}
