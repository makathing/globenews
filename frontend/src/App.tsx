import { useEffect, useState } from 'react';
import { SceneRoot } from './scene/SceneRoot';
import { EventRail } from './ui/EventRail';
import { EventPanel } from './ui/EventPanel';
import { Tooltip } from './ui/Tooltip';
import { Updated } from './ui/Updated';
import { MarkerToggle } from './ui/MarkerToggle';
import { useGlobeStore } from './store';
import { useUrlSync } from './lib/urlState';
import { BUNDLED_DATASET, fetchLatestDataset } from './lib/dataset';

/** Matches the rail's drawer breakpoint in styles.css. */
const DRAWER_QUERY = '(max-width: 900px)';
/** How often an open tab looks for a newer batch. */
const REFRESH_MS = 15 * 60 * 1000;

export function App() {
  const setDataset = useGlobeStore((s) => s.setDataset);
  const dataset = useGlobeStore((s) => s.dataset);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const [railOpen, setRailOpen] = useState(false);
  useUrlSync();

  // the stories ship inside the bundle, so there is nothing to wait for
  useEffect(() => {
    setDataset(BUNDLED_DATASET);
  }, [setDataset]);

  // On a phone the rail is a drawer over the globe, and the event panel opens
  // underneath it — pick a story and you'd get a panel you can't read. Picking
  // one is the end of browsing, so the drawer closes and hands the screen over.
  useEffect(() => {
    if (selectedId && window.matchMedia(DRAWER_QUERY).matches) setRailOpen(false);
  }, [selectedId]);

  // A radar left open all afternoon should not still be showing this
  // morning's batch. Look for a newer one when the tab comes back to the
  // front, and every quarter hour it stays there; adopt it only if the run
  // is genuinely newer than what is on screen.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const latest = await fetchLatestDataset(import.meta.env.BASE_URL);
      if (cancelled || !latest) return;
      const current = useGlobeStore.getState().dataset;
      if (!current || Date.parse(latest.generatedAt) > Date.parse(current.generatedAt)) {
        setDataset(latest);
      }
    };
    const timer = setInterval(check, REFRESH_MS);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [setDataset]);

  return (
    <div className={`app ${railOpen ? 'rail-open' : ''}`}>
      <SceneRoot />
      <EventRail />
      <EventPanel />
      <Tooltip />
      <Updated />
      <MarkerToggle />
      <button
        className="rail-toggle"
        onClick={() => setRailOpen((open) => !open)}
        aria-label={railOpen ? 'Hide event list' : 'Show event list'}
      >
        {railOpen ? '✕' : '☰'}
      </button>
      {!dataset && <div className="data-status">Loading events…</div>}
    </div>
  );
}
