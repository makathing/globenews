import { useState } from 'react';
import type { NewsSource } from '../../../shared/news';
import { outletHue, outletInitials, outletName } from '../lib/outlets';

/**
 * An outlet's round mark: its own icon when the pipeline found one and it
 * loads, otherwise a monogram on a circle tinted by a hue derived from the
 * domain — so the same outlet looks the same on every card.
 */
export function OutletMark({ source, size = 16 }: { source: NewsSource; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (source.icon && !failed) {
    return (
      <span className="outlet-mark is-logo" style={style} title={source.domain}>
        <img
          src={source.icon}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  const initials = outletInitials(source.domain);
  return (
    <span
      className="outlet-mark is-monogram"
      style={{
        ...style,
        // white on a mid-dark tint reads on every theme's panel, light or dark
        background: `hsl(${outletHue(source.domain)} 42% 38%)`,
        fontSize: Math.round(size * (initials.length > 1 ? 0.44 : 0.56)),
      }}
      title={source.domain}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Who is carrying the story: up to three outlet marks and names, then "+N". */
export function SourceLogos({ sources, max = 3 }: { sources: NewsSource[]; max?: number }) {
  // one entry per outlet: two links from the same domain are one voice
  const outlets: NewsSource[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const key = source.domain.replace(/^www\./, '');
    if (seen.has(key)) continue;
    seen.add(key);
    outlets.push(source);
  }
  if (outlets.length === 0) return null;
  const shown = outlets.slice(0, max);
  const more = outlets.length - shown.length;
  const names = shown.map((source) => outletName(source.domain));

  return (
    <div className="source-logos" title={outlets.map((s) => s.domain).join(', ')}>
      <span className="source-logos-marks">
        {shown.map((source) => (
          <OutletMark key={source.domain} source={source} size={16} />
        ))}
      </span>
      <span className="source-logos-names">
        {names.join(' · ')}
      </span>
      {more > 0 && <span className="source-logos-more">+{more}</span>}
    </div>
  );
}
