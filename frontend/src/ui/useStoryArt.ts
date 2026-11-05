import { useMemo } from 'react';
import type { NewsEvent } from '../../../shared/news';
import { artChain, artChains, type ArtCandidate } from '../lib/illustration';
import { PHOTO_LIBRARY } from '../lib/photoLibrary';
import { inRegion } from '../lib/regions';
import { briefing, byDistance, isFollowed, matchesQuery, railOrder } from '../lib/reader';
import { useGlobeStore, useVisibleEvents } from '../store';

export { railOrder };

/** Visible stories in rail order, with each story's art chain (library photos spread across cards). */
export function useRailStories(): { sorted: NewsEvent[]; chains: Map<string, ArtCandidate[]> } {
  const events = useVisibleEvents();
  const follows = useGlobeStore((s) => s.follows);
  return useMemo(() => {
    const sorted = railOrder(events, follows);
    // chains from severity order alone, so following a place never swaps pictures
    return { sorted, chains: artChains(railOrder(events), PHOTO_LIBRARY) };
  }, [events, follows]);
}

/**
 * What the lists show: the visible stories inside the region view, in rail
 * order. Art chains come from the unfiltered rail, so switching region never
 * swaps a card's picture.
 */
export function useListStories(): { sorted: NewsEvent[]; chains: Map<string, ArtCandidate[]> } {
  const rail = useRailStories();
  const region = useGlobeStore((s) => s.region);
  const query = useGlobeStore((s) => s.query);
  const followingOnly = useGlobeStore((s) => s.followingOnly);
  const follows = useGlobeStore((s) => s.follows);
  const listView = useGlobeStore((s) => s.listView);
  const near = useGlobeStore((s) => s.near);
  return useMemo(() => {
    let sorted = region === 'world' ? rail.sorted : rail.sorted.filter((event) => inRegion(event, region));
    if (query.trim()) sorted = sorted.filter((event) => matchesQuery(event, query));
    if (followingOnly) sorted = sorted.filter((event) => isFollowed(event, follows));
    if (listView === 'top') sorted = briefing(sorted);
    else if (near) sorted = byDistance(sorted, near);
    return { sorted, chains: rail.chains };
  }, [rail, region, query, followingOnly, follows, listView, near]);
}

/** One story's chain — the same picture its rail card shows, so the panel never swaps photos. */
export function useStoryArtChain(event: NewsEvent | undefined): ArtCandidate[] | null {
  const { chains } = useRailStories();
  return useMemo(
    () => (event ? (chains.get(event.id) ?? artChain(event, PHOTO_LIBRARY)) : null),
    [event, chains],
  );
}
