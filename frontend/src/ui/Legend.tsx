import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../../../shared/news';
import { useGlobeStore } from '../store';

export function Legend() {
  const hidden = useGlobeStore((s) => s.hidden);
  const toggleCategory = useGlobeStore((s) => s.toggleCategory);
  const dataset = useGlobeStore((s) => s.dataset);

  const counts = new Map<string, number>();
  for (const event of dataset?.events ?? []) {
    counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }

  return (
    <aside className="hud-panel legend" aria-label="Category filters">
      <div className="panel-heading">SIGNAL TYPES</div>
      <div className="legend-chips">
        {CATEGORIES.map((category) => {
          const off = hidden.has(category);
          return (
            <button
              key={category}
              className={`legend-chip ${off ? 'off' : ''}`}
              style={{ ['--chip-color' as string]: CATEGORY_COLORS[category] }}
              onClick={() => toggleCategory(category)}
              title={`${off ? 'Show' : 'Hide'} ${CATEGORY_LABELS[category]}`}
            >
              <span className="chip-dot" />
              {CATEGORY_LABELS[category]}
              <span className="chip-count">{counts.get(category) ?? 0}</span>
            </button>
          );
        })}
      </div>
      <div className="severity-scale" title="Blip size and pulse rate scale with severity">
        <span className="scale-label">SEV</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="scale-dot" style={{ width: 4 + s * 2, height: 4 + s * 2 }} />
        ))}
      </div>
    </aside>
  );
}
