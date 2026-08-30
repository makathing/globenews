import { useState } from 'react';
import {
  BIAS_RATINGS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type NewsEvent,
  type NewsSource,
} from '../../../shared/news';
import { useGlobeStore } from '../store';
import { CategoryIcon, ClockIcon, ShieldIcon } from './icons';

function trustColor(score: number): string {
  if (score >= 75) return '#57e39f';
  if (score >= 50) return '#ffd60a';
  return '#ff5c5c';
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

function PreviewCard({ event }: { event: NewsEvent }) {
  const [failed, setFailed] = useState(false);
  const color = CATEGORY_COLORS[event.category];

  if (!event.image || failed) {
    return (
      <div
        className="preview-card preview-fallback"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${color} 26%, #10141b), #10141b 78%)`,
          color,
        }}
      >
        <CategoryIcon category={event.category} size={40} strokeWidth={1.2} />
      </div>
    );
  }
  return (
    <div className="preview-card">
      <img
        src={event.image.url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      <span className="preview-credit">via {event.image.domain}</span>
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

export function EventPanel() {
  const dataset = useGlobeStore((s) => s.dataset);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const select = useGlobeStore((s) => s.select);

  const event = dataset?.events.find((e) => e.id === selectedId);
  if (!event) return null;

  return (
    <aside className="panel event-panel" aria-label="Event details">
      <div className="event-panel-head">
        <span
          className="category-badge"
          style={{ ['--chip-color' as string]: CATEGORY_COLORS[event.category] }}
        >
          <CategoryIcon category={event.category} size={12} />
          {CATEGORY_LABELS[event.category]}
        </span>
        <SeverityTicks severity={event.severity} />
        {event.isBreaking && <span className="breaking-badge">Breaking</span>}
        <button className="close-btn" onClick={() => select(null)} aria-label="Close panel">
          ✕
        </button>
      </div>

      <PreviewCard event={event} />

      <h2 className="event-headline">{event.headline}</h2>
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
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="source-domain">{source.domain}</span>
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
        <ClockIcon size={12} /> First seen{' '}
        {new Date(event.firstSeen).toISOString().slice(0, 16).replace('T', ' ')} UTC
      </div>
    </aside>
  );
}
