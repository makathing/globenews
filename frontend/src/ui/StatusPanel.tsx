import { useEffect, useState } from 'react';
import { useGlobeStore } from '../store';
import { THEME_IDS, THEMES } from '../themes';

function formatUtc(date: Date): string {
  return date.toISOString().slice(11, 19);
}

function formatScan(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  return sameDay
    ? date.toISOString().slice(11, 16) + ' UTC'
    : date.toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
}

/** Compact bottom-right cluster: live stats + globe theme switcher. */
export function StatusPanel() {
  const dataset = useGlobeStore((s) => s.dataset);
  const theme = useGlobeStore((s) => s.theme);
  const setTheme = useGlobeStore((s) => s.setTheme);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasBreaking = dataset?.events.some((e) => e.isBreaking) ?? false;

  return (
    <aside className="panel status-panel" aria-label="Status and theme">
      <div className="status-row">
        <span className={`status-dot ${hasBreaking ? 'alert' : 'ok'}`} />
        <span className="status-main">
          {dataset ? `${dataset.events.length} signals` : 'loading…'}
          {hasBreaking && <em className="status-breaking"> · breaking</em>}
        </span>
        <span className="status-clock">{formatUtc(now)} UTC</span>
      </div>
      {dataset && (
        <div className="status-sub">Last scan {formatScan(dataset.generatedAt)}</div>
      )}
      <div className="theme-picker" role="radiogroup" aria-label="Globe theme">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={theme === id}
            className={`theme-btn ${theme === id ? 'active' : ''}`}
            onClick={() => setTheme(id)}
          >
            {THEMES[id].label}
          </button>
        ))}
      </div>
    </aside>
  );
}
