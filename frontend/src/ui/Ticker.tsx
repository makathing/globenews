import { CATEGORY_COLORS } from '../../../shared/news';
import { useGlobeStore } from '../store';

export function Ticker() {
  const dataset = useGlobeStore((s) => s.dataset);
  const select = useGlobeStore((s) => s.select);

  const items = (dataset?.events ?? []).filter((e) => e.isBreaking || e.severity >= 4);
  if (items.length === 0) return null;

  // duplicated list = seamless CSS marquee loop
  const loop = [...items, ...items];

  return (
    <div className="ticker" aria-label="Breaking and high-severity headlines">
      <div className="ticker-tag">▲ PRIORITY</div>
      <div className="ticker-viewport">
        <div className="ticker-track" style={{ animationDuration: `${items.length * 9}s` }}>
          {loop.map((event, i) => (
            <button
              key={`${event.id}-${i}`}
              className="ticker-item"
              onClick={() => select(event.id)}
            >
              <span
                className="ticker-dot"
                style={{ background: event.isBreaking ? '#ffffff' : CATEGORY_COLORS[event.category] }}
              />
              {event.isBreaking && <span className="ticker-breaking">BREAKING</span>}
              {event.headline}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
