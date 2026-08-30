import { useEffect, useState } from 'react';
import type { NewsDataset } from '../../shared/news';
import { SceneRoot } from './scene/SceneRoot';
import { TopBar } from './ui/TopBar';
import { Legend } from './ui/Legend';
import { Ticker } from './ui/Ticker';
import { EventPanel } from './ui/EventPanel';
import { Tooltip } from './ui/Tooltip';
import { Boot } from './ui/Boot';
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
      <TopBar />
      <Legend />
      <Ticker />
      <EventPanel />
      <Tooltip />
      <Boot />
      <div className="scanlines" aria-hidden />
      {!dataset && !error && <div className="data-status">ACQUIRING SIGNAL FEED…</div>}
      {error && <div className="data-status">SIGNAL FEED OFFLINE — {error}</div>}
    </div>
  );
}
