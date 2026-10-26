import { useEffect, useMemo, useRef } from 'react';
import { CATEGORIES, CATEGORY_LABELS, type NewsEvent } from '../../../shared/news';
import type { ArtCandidate } from '../lib/illustration';
import { freshness, isNew, isUpdated, relativeTime } from '../lib/freshness';
import { useGlobeStore } from '../store';
import { CategoryIcon } from './icons';
import { SourceLogos } from './SourceLogos';
import { StatusPanel } from './StatusPanel';
import { StoryArt } from './StoryArt';
import { useRailStories } from './useStoryArt';

function EventCard({
  event,
  art,
  selected,
}: {
  event: NewsEvent;
  art: ArtCandidate[];
  selected: boolean;
}) {
  const hoverId = useGlobeStore((s) => s.hoverId);
  const select = useGlobeStore((s) => s.select);
  const hoveredId = useGlobeStore((s) => s.hovered?.id ?? null);
  const ref = useRef<HTMLButtonElement>(null);
  const scrollToId = useGlobeStore((s) => s.scrollToId);
  const clearScrollTo = useGlobeStore((s) => s.clearScrollTo);

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
      className={`event-card ${selected ? 'selected' : ''} ${hoveredId === event.id ? 'hovered' : ''}`}
      style={{
        // older stories recede
        opacity: 0.6 + freshness(event) * 0.4,
      }}
      onMouseEnter={() => hoverId(event.id)}
      onMouseLeave={() => hoverId(null)}
      onClick={() => select(event.id)}
      title={CATEGORY_LABELS[event.category]}
    >
      <div className="card-head">
        <span className="card-icon" style={{ color: `var(--cat-${event.category})` }}>
          <CategoryIcon category={event.category} size={14} />
        </span>
        <span className="card-headline">{event.headline}</span>
      </div>

      <StoryArt chain={art} category={event.category} linkCredit={false} />

      <SourceLogos sources={event.sources} />

      <div className="card-foot">
        {event.isBreaking && <span className="card-breaking">Breaking</span>}
        {!event.isBreaking && isUpdated(event) && <span className="card-updated">Updated</span>}
        {!event.isBreaking && !isUpdated(event) && isNew(event) && (
          <span className="card-new">New</span>
        )}
        <span className="card-time">
          {isUpdated(event)
            ? `Updated ${relativeTime(event.lastUpdated)}`
            : `Added ${relativeTime(event.firstSeen)}`}
        </span>
        <span className="card-trust" title={`Trust ${event.trustScore}/100`}>
          {event.trustScore}
        </span>
      </div>
    </button>
  );
}

export function EventRail() {
  const dataset = useGlobeStore((s) => s.dataset);
  const hidden = useGlobeStore((s) => s.hidden);
  const toggleCategory = useGlobeStore((s) => s.toggleCategory);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const { sorted, chains } = useRailStories();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of dataset?.events ?? []) {
      map.set(event.category, (map.get(event.category) ?? 0) + 1);
    }
    return map;
  }, [dataset]);

  return (
    <aside className="rail" aria-label="Event list">
      <header className="rail-head">
        <div className="rail-brand">
          GlobeNews
          <span className="rail-count">{sorted.length}</span>
        </div>
        <div className="rail-filters" role="group" aria-label="Category filters">
          {CATEGORIES.map((category) => {
            const off = hidden.has(category);
            return (
              <button
                key={category}
                className={`filter-chip ${off ? 'off' : ''}`}
                style={{ color: off ? undefined : `var(--cat-${category})` }}
                onClick={() => toggleCategory(category)}
                title={`${off ? 'Show' : 'Hide'} ${CATEGORY_LABELS[category]} (${counts.get(category) ?? 0})`}
                aria-pressed={!off}
              >
                <CategoryIcon category={category} size={12} />
                <span className="filter-count">{counts.get(category) ?? 0}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="rail-list">
        {sorted.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            art={chains.get(event.id) ?? []}
            selected={selectedId === event.id}
          />
        ))}
        {sorted.length === 0 && (
          <div className="rail-empty">No events match the current filters.</div>
        )}
      </div>

      <StatusPanel />
    </aside>
  );
}
