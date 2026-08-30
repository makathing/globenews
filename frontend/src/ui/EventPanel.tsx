import { BIAS_RATINGS, CATEGORY_COLORS, CATEGORY_LABELS, type NewsSource } from '../../../shared/news';
import { useGlobeStore } from '../store';

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
  // left .. right across 5 positions
  const pct = known ? (index / 4) * 100 : 50;
  return (
    <div className={`bias-spectrum ${known ? '' : 'unknown'}`} title={`Bias: ${source.bias}`}>
      <span className="bias-track" />
      <span className="bias-pip" style={{ left: `${pct}%` }} />
    </div>
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
        <span className="category-badge" style={{ ['--chip-color' as string]: CATEGORY_COLORS[event.category] }}>
          {CATEGORY_LABELS[event.category]}
        </span>
        <span className="severity-badge" title="Severity 1-5">
          Severity {event.severity}
        </span>
        {event.isBreaking && <span className="breaking-badge">Breaking</span>}
        <button className="close-btn" onClick={() => select(null)} aria-label="Close panel">
          ✕
        </button>
      </div>

      <h2 className="event-headline">{event.headline}</h2>
      <div className="event-location">{event.locationName}</div>
      <p className="event-summary">{event.summary}</p>

      <div className="trust-block">
        <div className="trust-row">
          <span className="panel-heading">Trust score</span>
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
        First seen {new Date(event.firstSeen).toISOString().slice(0, 16).replace('T', ' ')} UTC
      </div>
    </aside>
  );
}
