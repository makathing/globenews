import { useMemo, useState } from 'react';
import { countSinceVisit } from '../lib/reader';
import { useGlobeStore } from '../store';
import { PinIcon, SearchIcon, StarIcon } from './icons';

/** "Tue 18:02" in the reader's own time zone. */
function visitLabel(at: number): string {
  return new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * The reader's tools above the list: search, the briefing / everything
 * switch, following, and near me. Shared by the desktop rail and the mobile
 * sheet.
 */
export function ReaderBar({ className = '' }: { className?: string }) {
  const query = useGlobeStore((s) => s.query);
  const setQuery = useGlobeStore((s) => s.setQuery);
  const listView = useGlobeStore((s) => s.listView);
  const setListView = useGlobeStore((s) => s.setListView);
  const followingOnly = useGlobeStore((s) => s.followingOnly);
  const setFollowingOnly = useGlobeStore((s) => s.setFollowingOnly);
  const follows = useGlobeStore((s) => s.follows);
  const near = useGlobeStore((s) => s.near);
  const setNear = useGlobeStore((s) => s.setNear);
  const viewing = useGlobeStore((s) => s.viewingDate !== null);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied'>('idle');
  const followCount = follows.storylines.length + follows.places.length;

  const askNear = () => {
    if (near) {
      setNear(null);
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocating('denied');
      return;
    }
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating('idle');
        setNear({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => setLocating('denied'),
      // coarse is all we keep, so ask for no more than that
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 10_000 },
    );
  };

  return (
    <div className={`reader-bar ${className}`}>
      <label className="reader-search">
        <SearchIcon size={14} aria-hidden />
        <span className="sr-only">Search stories</span>
        <input
          type="search"
          value={query}
          placeholder="Search stories, places, topics"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
          enterKeyHint="search"
        />
      </label>
      <div className="reader-chips" role="group" aria-label="List view">
        <button
          className={`reader-chip ${listView === 'top' ? 'active' : ''}`}
          aria-pressed={listView === 'top'}
          onClick={() => setListView(listView === 'top' ? 'all' : 'top')}
          title="A short briefing: the most important stories, plus the top story of every area and topic"
        >
          Briefing
        </button>
        <button
          className={`reader-chip ${followingOnly ? 'active' : ''}`}
          aria-pressed={followingOnly}
          onClick={() => setFollowingOnly(!followingOnly)}
          disabled={followCount === 0 && !followingOnly}
          title={
            followCount === 0
              ? 'Follow a place or an ongoing story from any open story'
              : 'Only places and storylines you follow'
          }
        >
          <StarIcon size={12} filled={followingOnly} aria-hidden /> Following
          {followCount > 0 && <span className="reader-chip-count">{followCount}</span>}
        </button>
        {!viewing && (
          <button
            className={`reader-chip ${near ? 'active' : ''}`}
            aria-pressed={near !== null}
            aria-busy={locating === 'busy'}
            onClick={askNear}
            title={
              locating === 'denied'
                ? 'Location unavailable — allow it in your browser to sort by distance'
                : 'Sort by distance from you (approximate location, never stored)'
            }
          >
            <PinIcon size={12} aria-hidden /> {locating === 'denied' ? 'No location' : 'Near me'}
          </button>
        )}
      </div>
    </div>
  );
}

/** "7 new · 4 updated since Tue 18:02" — nothing on a first visit or an archived day. */
export function SinceVisit({ className = '' }: { className?: string }) {
  const lastVisit = useGlobeStore((s) => s.lastVisit);
  const dataset = useGlobeStore((s) => s.dataset);
  const viewing = useGlobeStore((s) => s.viewingDate !== null);
  const { added, updated } = useMemo(
    () => countSinceVisit(dataset?.events ?? [], lastVisit),
    [dataset, lastVisit],
  );
  if (viewing || lastVisit === null || added + updated === 0) return null;
  const parts = [added > 0 ? `${added} new` : '', updated > 0 ? `${updated} updated` : ''].filter(Boolean);
  return (
    <p className={`since-visit ${className}`}>
      {parts.join(' · ')} since your last visit ({visitLabel(lastVisit)})
    </p>
  );
}
