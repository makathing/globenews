import { useMemo } from 'react';
import { REGION_IDS, REGIONS, regionOf, type RegionId } from '../lib/regions';
import { useGlobeStore, useVisibleEvents } from '../store';
import { radioKeyDown } from './radio';

const SHORT: Record<RegionId, string> = {
  world: 'World',
  us: 'US',
  europe: 'Europe',
  asia: 'Asia',
  'africa-me': 'Africa & ME',
  americas: 'Americas',
};

/** Region views: fly the camera there and filter the list. */
export function RegionChips({ className = '' }: { className?: string }) {
  const region = useGlobeStore((s) => s.region);
  const setRegion = useGlobeStore((s) => s.setRegion);
  const events = useVisibleEvents();

  const counts = useMemo(() => {
    const map = new Map<RegionId, number>([['world', events.length]]);
    for (const event of events) {
      const r = regionOf(event);
      map.set(r, (map.get(r) ?? 0) + 1);
    }
    return map;
  }, [events]);

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
            <span aria-hidden>{SHORT[id]}</span>
            <span className="region-count" aria-hidden>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
