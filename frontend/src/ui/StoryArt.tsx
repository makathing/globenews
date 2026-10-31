import { useEffect, useState, type SyntheticEvent } from 'react';
import type { Category } from '../../../shared/news';
import type { ArtCandidate } from '../lib/illustration';
import { CategoryIcon } from './icons';

/** Anything narrower than this "loaded" but is a tracking pixel or a spacer, not a picture. */
const MIN_WIDTH = 48;

/**
 * A story's one picture: the first candidate in its art chain that loads.
 * Every image's `onError` moves on to the next candidate, ending in a quiet
 * category-colour panel that needs nothing from the network.
 *
 * `linkCredit` is off inside a story card: the card is itself a button, and a
 * link nested in a button is invalid and would steal the card's click. The
 * story panel carries the linked credit.
 */
export function StoryArt({
  chain,
  category,
  size = 'card',
  linkCredit = true,
}: {
  chain: ArtCandidate[];
  category: Category;
  size?: 'card' | 'panel' | 'thumb';
  linkCredit?: boolean;
}) {
  const chainKey = chain.map((c) => c.key).join('|');
  const [index, setIndex] = useState(0);
  // a different story (or a refreshed dataset) starts from the top again
  useEffect(() => setIndex(0), [chainKey]);

  const candidate = chain[Math.min(index, chain.length - 1)] ?? { kind: 'panel', key: 'panel' };
  const next = () => setIndex((i) => Math.min(i + 1, chain.length - 1));
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    if (e.currentTarget.naturalWidth < MIN_WIDTH) next();
  };

  if (candidate.kind === 'panel') {
    return (
      <div
        className={`story-art story-art-${size} is-panel`}
        style={{ ['--art-cat' as string]: `var(--cat-${category})` }}
        aria-hidden
      >
        <CategoryIcon category={category} size={size === 'panel' ? 44 : size === 'thumb' ? 22 : 30} strokeWidth={1.3} />
      </div>
    );
  }

  return (
    <div className={`story-art story-art-${size} ${candidate.kind === 'library' ? 'is-illustrative' : ''}`}>
      <img
        key={candidate.key}
        src={candidate.src}
        alt={candidate.kind === 'library' ? `Illustrative photo: ${candidate.photo.title}` : ''}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={next}
        onLoad={onLoad}
      />
      {candidate.kind === 'source' ? (
        <span className="art-credit">{candidate.credit}</span>
      ) : (
        <>
          <span className="art-badge" title="A photo of the topic, not of this event">
            Illustrative
          </span>
          <LibraryCredit candidate={candidate} link={linkCredit} />
        </>
      )}
    </div>
  );
}

function LibraryCredit({
  candidate,
  link,
}: {
  candidate: Extract<ArtCandidate, { kind: 'library' }>;
  link: boolean;
}) {
  const { photo } = candidate;
  const text = `Photo: ${photo.author || 'Unknown'} · ${photo.license}`;
  const title = `${photo.title} — ${photo.author || 'Unknown'}, ${photo.license} (Wikimedia Commons)`;
  if (!link) {
    return (
      <span className="art-credit is-library" title={title}>
        {text}
      </span>
    );
  }
  return (
    <a
      className="art-credit is-library"
      href={photo.page}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
    >
      {text}
    </a>
  );
}
