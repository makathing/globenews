import { useEffect, useState } from 'react';
import { useGlobeStore } from '../store';
import { ThemeControls } from './ThemeControls';

function formatUtc(date: Date): string {
  return date.toISOString().slice(11, 19);
}

/** Rail footer: signal count, UTC clock, the site theme switcher and the space-view switch. */
export function StatusPanel() {
  const dataset = useGlobeStore((s) => s.dataset);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasBreaking = dataset?.events.some((e) => e.isBreaking) ?? false;
  const dotState = hasBreaking ? 'alert' : 'ok';

  return (
    <aside className="panel status-panel" aria-label="Status and theme">
      <div className="status-row">
        <span className={`status-dot ${dotState}`} aria-hidden />
        <span className="status-main">
          {dataset ? `${dataset.events.length} signals` : 'loading…'}
          {hasBreaking && <em className="status-breaking"> · breaking</em>}
        </span>
        <span className="status-clock">{formatUtc(now)} UTC</span>
      </div>
      <ThemeControls />
    </aside>
  );
}
