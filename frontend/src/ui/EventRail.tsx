import { useEffect, useMemo, useRef } from 'react';
import {
  CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type NewsEvent,
} from '../../../shared/news';
import { SEVERITY_COLORS, freshness, isNew, relativeTime } from '../lib/beams';
import { useGlobeStore, useVisibleEvents } from '../store';
import { CategoryIcon } from './icons';
import { StatusPanel } from './StatusPanel';

/** Short outlet name for a preview tile when no image resolved: "reuters.com" -> "reuters". */
function outletName(domain: string): string {
  return domain.replace(/^www\./, '').split('.')[0];
}

function SourcePreviews({ event }: { event: NewsEvent }) {
  // one tile per source, up to three — images where we have them, the outlet
  // name where we don't, so the row still says who is carrying the story
  const previews = event.sources.slice(0, 3);
  if (previews.length === 0) return null;
  return (
    <div className="card-sources">
      {previews.map((source) => (
        <span key={source.url} className="card-source" title={source.domain}>
          {source.image ? (
            <img src={source.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className="card-source-name">{outletName(source.domain)}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function EventCard({ event, selected }: { event: NewsEvent; selected: boolean }) {
  const hoverId = useGlobeStore((s) => s.hoverId);
  const select = useGlobeStore((s) => s.select);
  const hoveredId = useGlobeStore((s) => s.hovered?.id ?? null);
  const color = CATEGORY_COLORS[event.category];
  const ref = useRef<HTMLButtonElement>(null);
  const scrollToId = useGlobeStore((s) => s.scrollToId);
  const clearScrollTo = useGlobeStore((s) => s.clearScrollTo);

  // when the selection came from clicking a beam, bring this card into view
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
        ['--chip-color' as string]: color,
        // older stories recede, matching their beams
        opacity: 0.6 + freshness(event) * 0.4,
      }}
      onMouseEnter={() => hoverId(event.id)}
      onMouseLeave={() => hoverId(null)}
      onClick={() => select(event.id)}
      title={CATEGORY_LABELS[event.category]}
    >
      <div className="card-head">
        <span className="card-icon" style={{ color }}>
          <CategoryIcon category={event.category} size={14} />
        </span>
        <span className="card-headline">{event.headline}</span>
      </div>

      <SourcePreviews event={event} />

      <div className="card-foot">
        {event.isBreaking && <span className="card-breaking">Breaking</span>}
        {isNew(event) && !event.isBreaking && <span className="card-new">New</span>}
        <span className="card-time">{relativeTime(event.firstSeen)}</span>
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
  const events = useVisibleEvents();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of dataset?.events ?? []) {
      map.set(event.category, (map.get(event.category) ?? 0) + 1);
    }
    return map;
  }, [dataset]);

  // breaking first, then severity, then trust
  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          Number(b.isBreaking) - Number(a.isBreaking) ||
          b.severity - a.severity ||
          b.trustScore - a.trustScore,
      ),
    [events],
  );

  return (
    <aside className="rail" aria-label="Event list">
      <header className="rail-head">
        <div className="rail-brand">
          GlobeNews
          <span className="rail-count">{events.length}</span>
        </div>
        <div className="rail-filters" role="group" aria-label="Category filters">
          {CATEGORIES.map((category) => {
            const off = hidden.has(category);
            return (
              <button
                key={category}
                className={`filter-chip ${off ? 'off' : ''}`}
                style={{ ['--chip-color' as string]: CATEGORY_COLORS[category] }}
                onClick={() => toggleCategory(category)}
                title={`${off ? 'Show' : 'Hide'} ${CATEGORY_LABELS[category]} (${counts.get(category) ?? 0})`}
                aria-pressed={!off}
              >
                <span className="filter-dot" />
                <CategoryIcon category={category} size={12} />
                <span className="filter-count">{counts.get(category) ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="severity-key" title="Beam colour and height encode severity">
          <span className="severity-key-label">Minor</span>
          <span className="severity-key-ramp">
            {[1, 2, 3, 4, 5].map((level) => (
              <span key={level} style={{ background: SEVERITY_COLORS[level] }} />
            ))}
          </span>
          <span className="severity-key-label">Historic</span>
        </div>
      </header>

      <div className="rail-list">
        {sorted.map((event) => (
          <EventCard key={event.id} event={event} selected={selectedId === event.id} />
        ))}
        {sorted.length === 0 && (
          <div className="rail-empty">No events match the current filters.</div>
        )}
      </div>

      <StatusPanel />
    </aside>
  );
}
