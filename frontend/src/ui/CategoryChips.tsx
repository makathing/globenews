import { useMemo } from 'react';
import { CATEGORIES, CATEGORY_LABELS } from '../../../shared/news';
import { CATEGORY_SHORT } from '../lib/categories';
import { inRegion } from '../lib/regions';
import { useGlobeStore } from '../store';

/**
 * The colour key and the category filter in one: each chip is the category's
 * globe colour, its name and how many stories it has in the current region.
 * Pressed = shown on the globe and in the list.
 */
export function CategoryChips({ variant }: { variant: 'rail' | 'strip' }) {
  const dataset = useGlobeStore((s) => s.dataset);
  const hidden = useGlobeStore((s) => s.hidden);
  const region = useGlobeStore((s) => s.region);
  const toggleCategory = useGlobeStore((s) => s.toggleCategory);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of dataset?.events ?? []) {
      if (!inRegion(event, region)) continue;
      map.set(event.category, (map.get(event.category) ?? 0) + 1);
    }
    return map;
  }, [dataset, region]);

  return (
    <div className={`cat-chips cat-chips-${variant}`} role="group" aria-label="Categories: colour key and filter">
      {CATEGORIES.map((category) => {
        const off = hidden.has(category);
        const count = counts.get(category) ?? 0;
        return (
          <button
            key={category}
            className={`cat-chip ${off ? 'off' : ''}`}
            onClick={() => toggleCategory(category)}
            aria-pressed={!off}
            aria-label={`${CATEGORY_LABELS[category]}, ${count} ${count === 1 ? 'story' : 'stories'}`}
            title={`${off ? 'Show' : 'Hide'} ${CATEGORY_LABELS[category]}`}
          >
            <span className="cat-dot" style={{ background: `var(--cat-${category})` }} aria-hidden />
            <span className="cat-name" aria-hidden>
              {CATEGORY_SHORT[category]}
            </span>
            <span className="cat-count" aria-hidden>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
