import { useEffect, useState } from 'react';
import type { NewsDataset } from '../../shared/news';
import { SceneRoot } from './scene/SceneRoot';
import { Legend } from './ui/Legend';
import { Ticker } from './ui/Ticker';
import { EventPanel } from './ui/EventPanel';
import { Tooltip } from './ui/Tooltip';
import { StatusPanel } from './ui/StatusPanel';
import { useGlobeStore } from './store';

export function App() {
  const setDataset = useGlobeStore((s) => s.setDataset);
  const dataset = useGlobeStore((s) => s.dataset);
  const [error, setError] = useState<string | null>(null);

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
    <div className="app">
      <SceneRoot />
      <div className="brand">GlobeNews</div>
      <Ticker />
      <Legend />
      <StatusPanel />
      <EventPanel />
      <Tooltip />
      {!dataset && !error && <div className="data-status">Loading events…</div>}
      {error && <div className="data-status">Couldn’t load events — {error}</div>}
    </div>
  );
}
