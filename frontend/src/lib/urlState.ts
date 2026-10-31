import { useEffect, useRef } from 'react';
import { useGlobeStore } from '../store';
import { readUrlState, writeUrlState, type UrlState } from './urlParams';

/**
 * Deep links and back/forward. The open story (`?event=`), the region view
 * (`?region=`) and an archived day (`?date=`) all live in the URL; the pure
 * reading and writing is in urlParams.ts.
 *
 * Feedback loops are avoided by direction: URL → state happens only on load
 * and on popstate (with `applying` set, so the state changes it causes don't
 * echo back), and state → URL only pushes when the URL actually differs. A
 * user's choice (story, region, day) pushes a history entry; the app
 * dropping a selection on its own (a live update expired the story) replaces.
 */

function stateToUrl(s: ReturnType<typeof useGlobeStore.getState>): UrlState {
  return { event: s.selectedId, region: s.region, date: s.viewingDate };
}

function here(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

/** Absolute share link for a story (on the archived day it is from, if one is on screen). */
export function shareUrlForEvent(id: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  const date = useGlobeStore.getState().viewingDate;
  if (date) url.searchParams.set('date', date);
  url.searchParams.set('event', id);
  return url.toString();
}

export function useUrlSync(): void {
  const hasData = useGlobeStore((s) => s.dataset !== null);
  const ready = useRef(false);
  const applying = useRef(false);

  // load: honour the incoming link once data is in (an archived day first,
  // so an `?event=` from that day can be found), then tidy the URL in place
  useEffect(() => {
    if (!hasData || ready.current || applying.current) return;
    applying.current = true;
    void (async () => {
      const url = readUrlState(window.location.search);
      if (url.date) await useGlobeStore.getState().viewDay(url.date);
      const { dataset, select } = useGlobeStore.getState();
      // fromGlobe so the list scrolls the story into view as well
      if (url.event && dataset?.events.some((e) => e.id === url.event)) select(url.event, { fromGlobe: true });
      // a dead story, an unknown region or a missing day leaves the URL here
      window.history.replaceState(window.history.state, '', writeUrlState(window.location.href, stateToUrl(useGlobeStore.getState())));
      applying.current = false;
      ready.current = true;
    })();
  }, [hasData]);

  // state -> URL
  useEffect(
    () =>
      useGlobeStore.subscribe((s, prev) => {
        if (!ready.current || applying.current) return;
        if (s.selectedId === prev.selectedId && s.region === prev.region && s.viewingDate === prev.viewingDate) return;
        const next = writeUrlState(window.location.href, stateToUrl(s));
        if (next === here()) return;
        const chosen = s.region !== prev.region || s.viewingDate !== prev.viewingDate || s.dataset === prev.dataset;
        if (chosen) window.history.pushState(null, '', next);
        else window.history.replaceState(window.history.state, '', next);
      }),
    [],
  );

  // back/forward -> state
  useEffect(() => {
    const onPop = async () => {
      if (!ready.current) return;
      applying.current = true;
      try {
        const url = readUrlState(window.location.search);
        await useGlobeStore.getState().viewDay(url.date);
        const store = useGlobeStore.getState();
        const region = url.region ?? 'world';
        if (store.region !== region) store.setRegion(region);
        const known = url.event && useGlobeStore.getState().dataset?.events.some((e) => e.id === url.event);
        useGlobeStore.getState().select(known ? url.event : null, { fromGlobe: true });
      } finally {
        applying.current = false;
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
