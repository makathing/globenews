import { useEffect, useState } from 'react';
import type { NewsDataset } from '../../shared/news';
import { SceneRoot } from './scene/SceneRoot';
import { EventRail } from './ui/EventRail';
import { EventPanel } from './ui/EventPanel';
import { Tooltip } from './ui/Tooltip';
import { Updated } from './ui/Updated';
import { MarkerToggle } from './ui/MarkerToggle';
import { useGlobeStore } from './store';
import { useUrlSync } from './lib/urlState';

/** Matches the rail's drawer breakpoint in styles.css. */
const DRAWER_QUERY = '(max-width: 900px)';

export function App() {
  const setDataset = useGlobeStore((s) => s.setDataset);
  const dataset = useGlobeStore((s) => s.dataset);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const [error, setError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  useUrlSync();

  // On a phone the rail is a drawer over the globe, and the event panel opens
  // underneath it — pick a story and you'd get a panel you can't read. Picking
  // one is the end of browsing, so the drawer closes and hands the screen over.
  useEffect(() => {
    if (selectedId && window.matchMedia(DRAWER_QUERY).matches) setRailOpen(false);
  }, [selectedId]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/events.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: NewsDataset) => setDataset(data))
      .catch((err) => setError(String(err)));
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
      {!dataset && !error && <div className="data-status">Loading events…</div>}
      {error && <div className="data-status">Couldn’t load events — {error}</div>}
    </div>
  );
}
