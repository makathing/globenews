import { useEffect, useRef } from 'react';
import { useGlobeStore } from '../store';
import { StoryBody, StoryHeader } from './StoryDetail';
import { useStoryArtChain } from './useStoryArt';

/** Desktop: the open story, as a panel on the right. Escape closes it. */
export function EventPanel() {
  const dataset = useGlobeStore((s) => s.dataset);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const select = useGlobeStore((s) => s.select);
  const ref = useRef<HTMLElement>(null);

  const event = dataset?.events.find((e) => e.id === selectedId);
  const art = useStoryArtChain(event);

  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, select]);

  // a new story scrolls the panel back to its top
  useEffect(() => {
    ref.current?.scrollTo?.({ top: 0 });
  }, [selectedId]);

  if (!event || !art) return null;
  return (
    <aside ref={ref} className="panel event-panel" aria-labelledby="event-panel-heading">
      <StoryHeader event={event}>
        <button className="close-btn" onClick={() => select(null)} aria-label="Close story">
          ✕
        </button>
      </StoryHeader>
      <StoryBody event={event} art={art} headingId="event-panel-heading" />
    </aside>
  );
}
