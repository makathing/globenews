import { useMemo } from 'react';
import type { NewsEvent } from '../../../shared/news';
import { artChain, artChains, type ArtCandidate } from '../lib/illustration';
import { PHOTO_LIBRARY } from '../lib/photoLibrary';
import { inRegion } from '../lib/regions';
import { useGlobeStore, useVisibleEvents } from '../store';

/** The rail's order: breaking first, then severity, then trust. */
export function railOrder(events: readonly NewsEvent[]): NewsEvent[] {
  return [...events].sort(
    (a, b) =>
      Number(b.isBreaking) - Number(a.isBreaking) ||
      b.severity - a.severity ||
      b.trustScore - a.trustScore,
  );
}

/** Visible stories in rail order, with each story's art chain (library photos spread across cards). */
export function useRailStories(): { sorted: NewsEvent[]; chains: Map<string, ArtCandidate[]> } {
  const events = useVisibleEvents();
  return useMemo(() => {
    const sorted = railOrder(events);
    return { sorted, chains: artChains(sorted, PHOTO_LIBRARY) };
  }, [events]);
}

/**
 * What the lists show: the visible stories inside the region view, in rail
 * order. Art chains come from the unfiltered rail, so switching region never
 * swaps a card's picture.
 */
export function useListStories(): { sorted: NewsEvent[]; chains: Map<string, ArtCandidate[]> } {
  const rail = useRailStories();
  const region = useGlobeStore((s) => s.region);
  return useMemo(
    () => ({
      sorted: region === 'world' ? rail.sorted : rail.sorted.filter((event) => inRegion(event, region)),
      chains: rail.chains,
    }),
    [rail, region],
  );
}

/** One story's chain — the same picture its rail card shows, so the panel never swaps photos. */
export function useStoryArtChain(event: NewsEvent | undefined): ArtCandidate[] | null {
  const { chains } = useRailStories();
  return useMemo(
    () => (event ? (chains.get(event.id) ?? artChain(event, PHOTO_LIBRARY)) : null),
    [event, chains],
  );
}
