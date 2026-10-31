import { expiryOf } from '../../../shared/retention';
import {
  BIAS_RATINGS,
  CATEGORY_LABELS,
  type NewsEvent,
  type NewsSource,
} from '../../../shared/news';
import { CategoryIcon, ClockIcon, ShieldIcon } from './icons';
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
      <p className="event-summary">{event.summary}</p>

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
          {event.sources.length} independent source{event.sources.length === 1 ? '' : 's'} · scored
          by corroboration, source reliability &amp; bias spread
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

      <div className="event-meta">
        <ClockIcon size={12} /> Added {utcMinute(event.firstSeen)}
        {event.lastUpdated !== event.firstSeen && <> · Updated {utcMinute(event.lastUpdated)}</>}
        {' · '}On the map until {utcDay(expiryOf(event))} UTC
      </div>
    </>
  );
}
