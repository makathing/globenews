import { expiryOf } from '../../../shared/retention';
import {
  BIAS_RATINGS,
  CATEGORY_LABELS,
  type NewsEvent,
  type NewsSource,
} from '../../../shared/news';
import { CategoryIcon, ClockIcon, ShieldIcon, StarIcon } from './icons';
import { independentCount, placeOf, relatedStories, syndicationLabel } from '../lib/reader';
import { US_STATES } from '../lib/regions';
import { useGlobeStore } from '../store';
import { relativeTime } from '../lib/freshness';
import { ShareButton } from './ShareButton';
import { OutletMark } from './SourceLogos';
import { outletName } from '../lib/outlets';
import { StoryArt } from './StoryArt';
import type { ArtCandidate } from '../lib/illustration';
import type { ReactNode } from 'react';

/**
 * Trust is neutral until it's a problem: a green/amber/red scale spends colour
 * on every value, when the only reading that needs to interrupt you is a story
 * we could not corroborate.
 */
/** "2026-09-02 05:13" — a UTC timestamp to the minute. */
function utcMinute(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

/** "2026-09-06" — a UTC day. */
function utcDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function trustColor(score: number): string {
  return score >= 41 ? 'var(--text)' : 'var(--warn)';
}

function trustLabel(score: number): string {
  if (score >= 75) return 'High confidence';
  if (score >= 50) return 'Corroborated';
  if (score >= 41) return 'Partial';
  return 'Unverified';
}

function BiasSpectrum({ source }: { source: NewsSource }) {
  const index = BIAS_RATINGS.indexOf(source.bias);
  const known = source.bias !== 'unknown';
  const pct = known ? (index / 4) * 100 : 50;
  return (
    <div className={`bias-spectrum ${known ? '' : 'unknown'}`} title={`Bias: ${source.bias}`}>
      <span className="bias-track" />
      {[0, 50, 100].map((tick) => (
        <span key={tick} className="bias-tick" style={{ left: `${tick}%` }} />
      ))}
      <span className="bias-pip" style={{ left: `${pct}%` }} />
    </div>
  );
}

function SeverityTicks({ severity }: { severity: number }) {
  return (
    <span className="severity-ticks" title={`Severity ${severity} of 5`}>
      {[1, 2, 3, 4, 5].map((tick) => (
        <span key={tick} className={`sev-tick ${tick <= severity ? 'on' : ''}`} />
      ))}
      <span className="sev-num">{severity}</span>
    </span>
  );
}

const STATUS_LABELS = {
  developing: 'Developing',
  confirmed: 'Confirmed',
  disputed: 'Disputed',
  corrected: 'Corrected',
} as const;

/** "France", "Texas" — what following a place is called. */
function placeName(event: NewsEvent): string | null {
  const place = placeOf(event);
  if (!place) return null;
  if (US_STATES[place]) return US_STATES[place];
  // the country is the last part of "City, Country" for world stories
  const parts = event.locationName.split(',').map((part) => part.trim());
  return parts[parts.length - 1] || place;
}

/** Follow the story's place and, if it has one, its storyline. */
function FollowButtons({ event }: { event: NewsEvent }) {
  const follows = useGlobeStore((s) => s.follows);
  const toggleFollowPlace = useGlobeStore((s) => s.toggleFollowPlace);
  const toggleFollowStoryline = useGlobeStore((s) => s.toggleFollowStoryline);
  const place = placeOf(event);
  const name = placeName(event);
  const storyline = event.storyline;
  if (!place && !storyline) return null;
  const followingPlace = place ? follows.places.includes(place) : false;
  const followingStoryline = storyline ? follows.storylines.includes(storyline.id) : false;
  return (
    <div className="follow-row" role="group" aria-label="Follow">
      {storyline && (
        <button
          className={`follow-btn ${followingStoryline ? 'on' : ''}`}
          aria-pressed={followingStoryline}
          onClick={() => toggleFollowStoryline(storyline.id)}
        >
          <StarIcon size={12} filled={followingStoryline} aria-hidden /> {storyline.label}
        </button>
      )}
      {place && name && (
        <button
          className={`follow-btn ${followingPlace ? 'on' : ''}`}
          aria-pressed={followingPlace}
          onClick={() => toggleFollowPlace(place)}
        >
          <StarIcon size={12} filled={followingPlace} aria-hidden /> {name}
        </button>
      )}
    </div>
  );
}

/** Earlier versions of a developing story, newest first. */
function Timeline({ event }: { event: NewsEvent }) {
  const entries = event.timeline ?? [];
  if (entries.length === 0) return null;
  return (
    <details className="timeline-block">
      <summary className="panel-heading">How this story developed ({entries.length + 1} reports)</summary>
      <ol className="timeline-list">
        <li className="timeline-item current">
          <span className="timeline-at">{utcMinute(event.lastUpdated)}</span>
          <span className="timeline-headline">{event.headline}</span>
          {event.whatChanged && <span className="timeline-change">{event.whatChanged}</span>}
        </li>
        {[...entries].reverse().map((entry) => (
          <li key={entry.at} className="timeline-item">
            <span className="timeline-at">{utcMinute(entry.at)}</span>
            <span className="timeline-headline">{entry.headline}</span>
            {entry.change && <span className="timeline-change">{entry.change}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Stories to read next: same storyline, same place, same kind of story nearby. */
function Related({ event }: { event: NewsEvent }) {
  const events = useGlobeStore((s) => s.dataset?.events);
  const select = useGlobeStore((s) => s.select);
  const related = events ? relatedStories(event, events) : [];
  if (related.length === 0) return null;
  return (
    <div className="related-block">
      <div className="panel-heading">Related</div>
      <ul className="related-list" role="list">
        {related.map((other) => (
          <li key={other.id}>
            <button className="related-item" onClick={() => select(other.id, { fromGlobe: true })}>
              <span className="card-icon" style={{ color: `var(--cat-${other.category})` }}>
                <CategoryIcon category={other.category} size={12} />
              </span>
              <span className="related-headline">{other.headline}</span>
              <span className="related-meta">
                {other.storyline && other.storyline.id === event.storyline?.id ? `${other.storyline.label} · ` : ''}
                {relativeTime(other.lastUpdated)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Badges, share and (optionally) close: the top row of an open story. */
export function StoryHeader({ event, children }: { event: NewsEvent; children?: ReactNode }) {
  return (
    <div className="event-panel-head">
      <span className="category-badge">
        <CategoryIcon category={event.category} size={12} style={{ color: `var(--cat-${event.category})` }} />
        {CATEGORY_LABELS[event.category]}
      </span>
      <SeverityTicks severity={event.severity} />
      {event.isBreaking && <span className="breaking-badge">Breaking</span>}
      {event.status && event.status !== 'confirmed' && (
        <span className={`status-badge status-${event.status}`}>{STATUS_LABELS[event.status]}</span>
      )}
      <ShareButton eventId={event.id} headline={event.headline} />
      {children}
    </div>
  );
}

/** An open story's body: picture, headline, summary, trust, sources, timestamps. */
export function StoryBody({ event, art, headingId }: { event: NewsEvent; art: ArtCandidate[]; headingId?: string }) {
  return (
    <>
      <StoryArt key={event.id} chain={art} category={event.category} size="panel" />

      <h2 className="event-headline" id={headingId}>{event.headline}</h2>
      <div className="event-location">{event.locationName}</div>
      {event.status === 'corrected' && event.correction && (
        <p className="correction-note" role="note">
          <strong>Correction:</strong> {event.correction}
        </p>
      )}
      {event.whatChanged && event.lastUpdated !== event.firstSeen && (
        <p className="what-changed">
          <span className="what-changed-label">What changed</span> {event.whatChanged}
        </p>
      )}
      <p className="event-summary">{event.summary}</p>
      {event.status === 'disputed' && (
        <p className="status-note">Sources disagree on key facts in this story — see the summary and compare the sources below.</p>
      )}
      <FollowButtons event={event} />
      <Timeline event={event} />

      <div className="trust-block">
        <div className="trust-row">
          <span className="panel-heading trust-heading">
            <ShieldIcon size={13} /> Trust score
          </span>
          <span className="trust-value" style={{ color: trustColor(event.trustScore) }}>
            {event.trustScore}/100 · {trustLabel(event.trustScore)}
          </span>
        </div>
        <div className="trust-bar">
          <div
            className="trust-fill"
            style={{ width: `${event.trustScore}%`, background: trustColor(event.trustScore) }}
          />
        </div>
        <div className="trust-note">
          {independentCount(event.sources)} independent newsroom{independentCount(event.sources) === 1 ? '' : 's'}
          {independentCount(event.sources) < event.sources.length && <> ({event.sources.length} sources, some syndicated)</>}{' '}
          · scored by corroboration, source reliability &amp; bias spread
        </div>
      </div>

      <div className="sources-block">
        <div className="panel-heading">Sources</div>
        {event.sources.map((source) => (
          <a
            key={source.url}
            className="source-row"
            href={source.url}
            title={source.homepage ? `${outletName(source.domain)} homepage — the article itself was not linked` : undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="source-domain">
              <OutletMark source={source} size={16} />
              {source.homepage ? (
                // only the outlet was named, not the article: link its front page, say so
                <>
                  {outletName(source.domain)}
                  <span className="source-homepage"> · outlet site</span>
                </>
              ) : (
                source.domain
              )}
              {syndicationLabel(source) && <span className="source-homepage"> · {syndicationLabel(source)}</span>}
              {source.published && <span className="source-date"> · {source.published}</span>}
            </span>
            <span className="source-rel" title="Reliability (0-100)">
              {source.reliability}
              {source.unrated ? '*' : ''}
            </span>
            <BiasSpectrum source={source} />
          </a>
        ))}
        <div className="source-legend">
          <span>L</span>
          <span>bias spectrum</span>
          <span>R</span>
        </div>
        {event.sources.some((s) => s.unrated) && (
          <div className="trust-note">* unrated domain — conservative default score</div>
        )}
      </div>

      <Related event={event} />

      <div className="event-meta">
        <ClockIcon size={12} /> Added {utcMinute(event.firstSeen)}
        {event.lastUpdated !== event.firstSeen && <> · Updated {utcMinute(event.lastUpdated)}</>}
        {' · '}On the map until {utcDay(expiryOf(event))} UTC
      </div>
    </>
  );
}
