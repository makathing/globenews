import { useEffect, useState } from 'react';
import { useGlobeStore } from '../store';
import { THEME_IDS, THEMES } from '../themes';
import { MARKER_STYLES, MARKER_STYLE_LABELS } from '../lib/markerStyle';

function formatUtc(date: Date): string {
  return date.toISOString().slice(11, 19);
}

/** Rail footer: signal count, UTC clock and the globe theme switcher. */
export function StatusPanel() {
  const dataset = useGlobeStore((s) => s.dataset);
  const theme = useGlobeStore((s) => s.theme);
  const setTheme = useGlobeStore((s) => s.setTheme);
  const markerStyle = useGlobeStore((s) => s.markerStyle);
  const setMarkerStyle = useGlobeStore((s) => s.setMarkerStyle);
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
      <div className="theme-picker marker-picker" role="radiogroup" aria-label="Event markers">
        {MARKER_STYLES.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={markerStyle === id}
            className={`theme-btn ${markerStyle === id ? 'active' : ''}`}
            onClick={() => setMarkerStyle(id)}
          >
            {MARKER_STYLE_LABELS[id]}
          </button>
        ))}
      </div>
    </aside>
  );
}
