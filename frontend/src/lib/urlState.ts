import { useEffect } from 'react';
import { useGlobeStore } from '../store';

/**
 * Deep links. The selected story lives in `?event=<id>` so a link points at a
 * specific story rather than "the homepage, good luck finding it". A query
 * param rather than a path segment, deliberately: static hosts (GitHub Pages)
 * serve index.html for `/?event=x` without any SPA-fallback configuration.
 */

const PARAM = 'event';

export function eventIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(PARAM);
}

function urlForEvent(id: string | null): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(PARAM, id);
  else url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}

/** Absolute share link for a story — used by the copy-link button. */
export function shareUrlForEvent(id: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, id);
  url.hash = '';
  return url.toString();
}

/**
 * Two-way sync between `selectedId` and the URL, without feedback loops:
 * URL-driven selections replace rather than push, and we only touch history
 * when the value actually differs from what's already there.
 */
export function useUrlSync(): void {
  const dataset = useGlobeStore((s) => s.dataset);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const select = useGlobeStore((s) => s.select);

  // once data is in, honour whatever the incoming link asked for
  useEffect(() => {
    if (!dataset) return;
    const wanted = eventIdFromUrl();
    if (!wanted) return;
    if (dataset.events.some((event) => event.id === wanted)) {
      // fromGlobe so the rail scrolls the story into view as well
      select(wanted, { fromGlobe: true });
    } else {
      // stale or bad link: drop the param rather than leaving a dead URL
      window.history.replaceState(null, '', urlForEvent(null));
    }
  }, [dataset, select]);

  // selection -> URL
  useEffect(() => {
    if (!dataset) return;
    if (eventIdFromUrl() === selectedId) return;
    window.history.pushState(null, '', urlForEvent(selectedId));
  }, [selectedId, dataset]);

  // back/forward -> selection
  useEffect(() => {
    const onPop = () => {
      const wanted = eventIdFromUrl();
      const known = wanted && useGlobeStore.getState().dataset?.events.some((e) => e.id === wanted);
      useGlobeStore.getState().select(known ? wanted : null, { fromGlobe: true });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
