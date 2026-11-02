import { useMemo } from 'react';
import { REGION_IDS, REGIONS, regionOf, type RegionId } from '../lib/regions';
import { useGlobeStore, useVisibleEvents } from '../store';
import { RegionIcon } from './icons';
import { radioKeyDown } from './radio';

/** Short names for chips and the region button; REGIONS[id].label is the accessible name. */
export const REGION_SHORT: Record<RegionId, string> = {
  world: 'World',
  us: 'US',
  europe: 'Europe',
  asia: 'Asia',
  'africa-me': 'Africa & ME',
  americas: 'Americas',
};

/** Stories per region among the visible (category-filtered) ones; 'world' is all of them. */
export function useRegionCounts(): Map<RegionId, number> {
  const events = useVisibleEvents();
  return useMemo(() => {
    const map = new Map<RegionId, number>([['world', events.length]]);
    for (const event of events) {
      const r = regionOf(event);
      map.set(r, (map.get(r) ?? 0) + 1);
    }
    return map;
  }, [events]);
}

/** Region views: fly the camera there and filter the list. */
export function RegionChips({ className = '' }: { className?: string }) {
  const region = useGlobeStore((s) => s.region);
  const setRegion = useGlobeStore((s) => s.setRegion);
  const counts = useRegionCounts();

  return (
    <div className={`region-chips ${className}`} role="radiogroup" aria-label="Region">
      {REGION_IDS.map((id) => {
        const count = counts.get(id) ?? 0;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={region === id}
            tabIndex={region === id ? 0 : -1}
            className={`region-chip ${region === id ? 'active' : ''}`}
            onClick={() => setRegion(id)}
            onKeyDown={(e) => radioKeyDown(e, REGION_IDS, region, setRegion)}
            aria-label={`${REGIONS[id].label}, ${count} ${count === 1 ? 'story' : 'stories'}`}
          >
            <RegionIcon region={id} size={14} className="region-icon" />
            <span aria-hidden>{REGION_SHORT[id]}</span>
            <span className="region-count" aria-hidden>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
