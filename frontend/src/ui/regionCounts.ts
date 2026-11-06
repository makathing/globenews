import { useMemo } from 'react';
import { regionOf, type RegionId } from '../lib/regions';
import { useVisibleEvents } from '../store';

/** Short names for the region button; REGIONS[id].label is the accessible name. */
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
