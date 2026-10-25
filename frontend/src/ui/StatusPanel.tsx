import { useEffect, useState } from 'react';
import { useGlobeStore } from '../store';
import { THEME_IDS, THEMES } from '../themes';

function formatUtc(date: Date): string {
  return date.toISOString().slice(11, 19);
}

/** Rail footer: signal count, UTC clock and the site theme switcher. */
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
  const dotState = hasBreaking ? 'alert' : 'ok';

  return (
    <aside className="panel status-panel" aria-label="Status and theme">
      <div className="status-row">
        <span className={`status-dot ${dotState}`} />
        <span className="status-main">
          {dataset ? `${dataset.events.length} signals` : 'loading…'}
          {hasBreaking && <em className="status-breaking"> · breaking</em>}
        </span>
        <span className="status-clock">{formatUtc(now)} UTC</span>
      </div>
      <div className="theme-picker" role="radiogroup" aria-label="Theme">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={theme === id}
            className={`theme-btn ${theme === id ? 'active' : ''}`}
            onClick={() => setTheme(id)}
          >
            <span
              className="theme-swatch"
              style={{ background: THEMES[id].bg, boxShadow: `inset 0 0 0 2px ${THEMES[id].accent}` }}
            />
            {THEMES[id].label}
          </button>
        ))}
      </div>
    </aside>
  );
}
