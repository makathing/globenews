import { useEffect, useRef, type ReactNode } from 'react';
import { CATEGORY_LABELS, type NewsEvent } from '../../../shared/news';
import { CATEGORY_SHORT } from '../lib/categories';
import type { ArtCandidate } from '../lib/illustration';
import { freshness, isNew, isUpdated, relativeTime } from '../lib/freshness';
import { groupByState } from '../lib/regions';
import { useGlobeStore } from '../store';
import { CategoryIcon } from './icons';
import { SourceLogos } from './SourceLogos';
import { StoryArt } from './StoryArt';

/**
 * Older stories recede, but only their picture: fading the whole card took
 * the headline below readable contrast. Text always stays full strength.
 */
function artOpacity(event: NewsEvent, now: number): number {
  return 0.55 + ((freshness(event, now) - 0.4) / 0.6) * 0.45;
}

function Marker({ event, now }: { event: NewsEvent; now: number }) {
  if (event.isBreaking) return <span className="card-breaking">Breaking</span>;
  if (isUpdated(event, now)) return <span className="card-updated">Updated</span>;
  if (isNew(event, now)) return <span className="card-new">New</span>;
  return null;
}

function timeText(event: NewsEvent, now: number): string {
  return isUpdated(event, now)
    ? `Updated ${relativeTime(event.lastUpdated, now)}`
    : `Added ${relativeTime(event.firstSeen, now)}`;
}

/** "Now" for relative times: an archived day is read as of when it was published. */
function useListNow(): number {
  const archived = useGlobeStore((s) => (s.viewingDate ? s.dataset?.generatedAt : null));
  return archived ? Date.parse(archived) : Date.now();
}

/** Desktop rail card: icon + headline, the story's picture, who carries it. */
function RailCard({ event, art, selected }: { event: NewsEvent; art: ArtCandidate[]; selected: boolean }) {
  const hoverId = useGlobeStore((s) => s.hoverId);
  const select = useGlobeStore((s) => s.select);
  const hovered = useGlobeStore((s) => s.hovered?.id === event.id);
  const scrollToId = useGlobeStore((s) => s.scrollToId);
  const clearScrollTo = useGlobeStore((s) => s.clearScrollTo);
  const ref = useRef<HTMLButtonElement>(null);
  const now = useListNow();

  // when the selection came from clicking the globe, bring this card into view
  useEffect(() => {
    if (scrollToId === event.id && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      clearScrollTo();
    }
  }, [scrollToId, event.id, clearScrollTo]);

  return (
    <button
      ref={ref}
      className={`event-card ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''}`}
      onMouseEnter={() => hoverId(event.id)}
      onMouseLeave={() => hoverId(null)}
      onClick={() => select(event.id)}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="card-head">
        <span className="card-icon" style={{ color: `var(--cat-${event.category})` }}>
          <CategoryIcon category={event.category} size={14} />
        </span>
        <span className="card-headline">
          <span className="sr-only">{CATEGORY_LABELS[event.category]}: </span>
          {event.headline}
        </span>
      </div>
      <div style={{ opacity: artOpacity(event, now) }}>
        <StoryArt chain={art} category={event.category} linkCredit={false} />
      </div>
      <SourceLogos sources={event.sources} />
      <div className="card-foot">
        <Marker event={event} now={now} />
        <span className="card-time">{timeText(event, now)}</span>
        <span className="card-trust" title={`Trust ${event.trustScore}/100`}>
          <span className="sr-only">Trust </span>
          {event.trustScore}
        </span>
      </div>
    </button>
  );
}

/** Mobile sheet card: thumbnail, category, headline, time. Three fit at the peek. */
function CompactCard({ event, art, selected }: { event: NewsEvent; art: ArtCandidate[]; selected: boolean }) {
  const select = useGlobeStore((s) => s.select);
  const now = useListNow();
  return (
    <button
      data-story={event.id}
      className={`m-card ${selected ? 'selected' : ''}`}
      onClick={() => select(event.id)}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="m-card-thumb" style={{ opacity: artOpacity(event, now) }}>
        <StoryArt chain={art} category={event.category} size="thumb" linkCredit={false} />
      </span>
      <span className="m-card-text">
        <span className="m-card-meta">
          <span className="cat-dot" style={{ background: `var(--cat-${event.category})` }} aria-hidden />
          <span>{CATEGORY_SHORT[event.category]}</span>
          <Marker event={event} now={now} />
          <span className="m-card-time">{relativeTime(isUpdated(event, now) ? event.lastUpdated : event.firstSeen, now)}</span>
        </span>
        <span className="m-card-headline">{event.headline}</span>
      </span>
    </button>
  );
}

/**
 * The story list for the rail and the mobile sheet. In the US view stories
 * are sectioned by state (from `subdivision`), busiest state first.
 */
export function StoryList({
  stories,
  chains,
  variant,
  empty,
}: {
  stories: NewsEvent[];
  chains: Map<string, ArtCandidate[]>;
  variant: 'rail' | 'compact';
  empty?: ReactNode;
}) {
  const selectedId = useGlobeStore((s) => s.selectedId);
  const region = useGlobeStore((s) => s.region);
  const Card = variant === 'rail' ? RailCard : CompactCard;

  if (stories.length === 0) {
    return <div className="rail-empty">{empty ?? 'No stories match the current filters.'}</div>;
  }
  const items = (list: NewsEvent[]) => (
    <ul className="story-list" role="list">
      {list.map((event) => (
        <li key={event.id}>
          <Card event={event} art={chains.get(event.id) ?? []} selected={selectedId === event.id} />
        </li>
      ))}
    </ul>
  );
  if (region !== 'us') return items(stories);
  return (
    <>
      {groupByState(stories).map((group) => (
        <section key={group.code || 'national'} className="story-group" aria-label={group.label}>
          <h3 className="story-group-head">
            {group.label}
            <span className="story-group-count">{group.events.length}</span>
          </h3>
          {items(group.events)}
        </section>
      ))}
    </>
  );
}
