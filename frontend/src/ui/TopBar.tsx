import { useEffect, useState } from 'react';
import { useGlobeStore } from '../store';

function formatUtc(date: Date): string {
  return date.toISOString().slice(11, 19) + ' UTC';
}

export function TopBar() {
  const dataset = useGlobeStore((s) => s.dataset);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasBreaking = dataset?.events.some((e) => e.isBreaking) ?? false;
  const lastScan = dataset ? new Date(dataset.generatedAt) : null;

  return (
    <header className="hud-panel top-bar">
      <div className="top-bar-title">
        <span className="logo-mark" aria-hidden>
          ◉
        </span>
        <h1>
          GLOBENEWS <span className="dim">// ORBITAL WATCH</span>
        </h1>
      </div>
      <div className="top-bar-stats">
        <div className="stat">
          <span className="stat-label">UTC</span>
          <span className="stat-value">{formatUtc(now)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">LAST SCAN</span>
          <span className="stat-value">
            {lastScan ? lastScan.toISOString().slice(0, 16).replace('T', ' ') : '——'}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">SIGNALS</span>
          <span className="stat-value">{dataset?.events.length ?? 0}</span>
        </div>
        <div className={`breaking-lamp ${hasBreaking ? 'on' : ''}`} title={hasBreaking ? 'Breaking event active' : 'No breaking events'}>
          <span className="lamp-dot" />
          BREAKING
        </div>
      </div>
    </header>
  );
}
