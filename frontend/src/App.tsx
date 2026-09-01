import { useEffect, useState } from 'react';
import type { NewsDataset } from '../../shared/news';
import { SceneRoot } from './scene/SceneRoot';
import { EventRail } from './ui/EventRail';
import { Timeline } from './ui/Timeline';
import { EventPanel } from './ui/EventPanel';
import { Tooltip } from './ui/Tooltip';
import { useGlobeStore } from './store';
import { useUrlSync } from './lib/urlState';

export function App() {
  const setDataset = useGlobeStore((s) => s.setDataset);
  const dataset = useGlobeStore((s) => s.dataset);
  const [error, setError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  useUrlSync();

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
      <Timeline />
      <EventPanel />
      <Tooltip />
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
