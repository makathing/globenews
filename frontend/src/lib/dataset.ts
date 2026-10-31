import { useEffect } from 'react';
import bundled from '../../../data/events.json';
import type { NewsDataset } from '../../../shared/news';
import { useGlobeStore } from '../store';

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

/*
 * LIVE UPDATES — the protocol, end to end.
 *
 * Producer (see README, "Scheduling & billing"):
 *   - 06:00 UTC daily: the full batch runs (it takes a while) and commits
 *     data/events.json to main.
 *   - hourly at :30: the breaking-news monitor; it commits only when it
 *     verifies a global-scale event, so most hours nothing changes.
 *   - every push to main runs deploy.yml (~1.5 min: image enrichment, build)
 *     and publishes to GitHub Pages. Stories keep a stable `id` across runs;
 *     a re-reported story keeps its id and `firstSeen` and moves `lastUpdated`;
 *     expired stories drop out (shared/retention.ts).
 *
 * Client (useLiveDataset below):
 *   - First paint uses the dataset compiled into the bundle (no request).
 *   - While the tab is visible it asks for data/events.json every 5 minutes,
 *     and at once when the tab comes back to the front or the network returns.
 *     A hidden tab never polls.
 *   - Each ask is a conditional GET: the ETag / Last-Modified of the last
 *     answer go back as If-None-Match / If-Modified-Since, so an unchanged
 *     file costs a bodiless 304. The URL carries no cache-busting stamp (that
 *     would make every request a distinct resource and defeat revalidation),
 *     and `cache: 'no-store'` keeps the browser's own HTTP cache from serving a
 *     stale copy or swallowing the 304: we do the revalidation ourselves.
 *     GitHub Pages' CDN may hold a copy for up to its max-age (10 min), so a
 *     publish reaches an open tab within ~5–15 min.
 *   - No extra timers at 06:05 / :35. A run's commit lands whenever the run
 *     finishes (a batch takes many minutes, plus the deploy), not at a fixed
 *     minute, so a timed check would usually be early; a steady 5-minute
 *     revalidation bounds the delay just as well for the cost of a 304.
 *   - A fetched dataset is adopted only if its `generatedAt` is newer than the
 *     one on screen, so a CDN edge serving an older copy can never roll back.
 *
 * On adoption (store.setDataset → scene/Earth.tsx):
 *   - A selected story that expired is deselected and `?event=` is replaced
 *     out of the URL; a re-reported one stays selected with its fresh text.
 *     A hover on an expired story is dropped.
 *   - Dots are stable per story (lib/eventDots.ts: everything keyed by id
 *     hash, never array position), so unchanged stories' dots are
 *     byte-identical between the old and new textures. The globe crossfades
 *     old → new over 1.2 s: new stories' dots fade in from the plain land
 *     dot, expired ones fade out, everything else holds still.
 *   - New stories (and breaking ones that are new or re-reported) get an
 *     arrival cue: three gentle brightness pulses over 4 s, no size change.
 *   - Reduced motion: the swap is instant and there is no cue.
 */

/** How often a visible tab revalidates the dataset. */
export const REFRESH_MS = 5 * 60 * 1000;
/** Visibility/online events closer together than this share one request. */
const MIN_GAP_MS = 20 * 1000;

/** Validators from the last full response, sent back on the next request. */
let validators: { etag: string | null; lastModified: string | null } = { etag: null, lastModified: null };

/**
 * The served data/events.json, if it changed since the last time we asked —
 * `dataset` is null when unchanged (304), unreachable or malformed.
 * `answered` says the server replied at all, which is what "checked 3 min
 * ago" in the status line reports.
 */
export async function fetchLatestDataset(base: string): Promise<{ dataset: NewsDataset | null; answered: boolean }> {
  try {
    const headers: Record<string, string> = {};
    if (validators.etag) headers['If-None-Match'] = validators.etag;
    if (validators.lastModified) headers['If-Modified-Since'] = validators.lastModified;
    const res = await fetch(`${base}data/events.json`, { cache: 'no-store', headers });
    if (res.status === 304) return { dataset: null, answered: true };
    if (!res.ok) return { dataset: null, answered: false };
    const dataset = (await res.json()) as NewsDataset;
    if (!dataset || !Array.isArray(dataset.events) || !dataset.generatedAt) return { dataset: null, answered: true };
    validators = { etag: res.headers.get('ETag'), lastModified: res.headers.get('Last-Modified') };
    return { dataset, answered: true };
  } catch {
    return { dataset: null, answered: false };
  }
}

/**
 * Keeps the store's live dataset current while the tab is open (protocol
 * above). While an archived day is on screen the poll is paused: the viewer
 * is reading history, and "Back to today" asks again at once.
 */
export function useLiveDataset(): void {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastAsked = 0;
    const check = async (force = false) => {
      if (document.visibilityState !== 'visible' || inFlight) return;
      if (useGlobeStore.getState().viewingDate) return;
      const now = Date.now();
      if (!force && now - lastAsked < MIN_GAP_MS) return;
      lastAsked = now;
      inFlight = true;
      try {
        const { dataset: latest, answered } = await fetchLatestDataset(import.meta.env.BASE_URL);
        if (cancelled) return;
        const { liveDataset: current, setLiveDataset, markChecked } = useGlobeStore.getState();
        if (answered) markChecked(Date.now());
        if (latest && (!current || Date.parse(latest.generatedAt) > Date.parse(current.generatedAt))) {
          setLiveDataset(latest);
        }
      } finally {
        inFlight = false;
      }
    };
    const onWake = () => void check();
    const timer = setInterval(() => void check(true), REFRESH_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    const unsubscribe = useGlobeStore.subscribe((s, prev) => {
      if (prev.viewingDate && !s.viewingDate) void check(true);
    });
    void check(true);
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
    };
  }, []);
}
