import { useCallback, useEffect, useRef, useState } from 'react';
import type { Category } from '../../../shared/news';
import { isRemoteSrc, judgeLoadedImage, type ArtCandidate } from '../lib/illustration';
import { CategoryIcon } from './icons';

/**
 * How long one picture may take, once its card is near the screen, before
 * the next candidate gets a turn. A host that neither answers nor refuses
 * (a stalled HTTP/2 stream, a blocked request some browsers never report)
 * would otherwise leave the card blank for good.
 */
export const LOAD_TIMEOUT_MS = 5_000;

/**
 * A story's one picture: the first candidate in its art chain that loads
 * and is fit to show (`judgeLoadedImage`: not logo-sized, not a banner).
 * Error, timeout or a rejected picture moves on to the next candidate; the
 * quiet category-colour panel at the end needs nothing from the network and
 * is reached only when even the site's own library copy has failed.
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
  const imgRef = useRef<HTMLImageElement | null>(null);
  // the candidate already settled (loaded, failed or timed out), so a late
  // event from it can't push the chain on a second time
  const settled = useRef<string | null>(null);

  const advance = useCallback(
    (from: string) => {
      if (settled.current === from) return;
      settled.current = from;
      setIndex((i) => (chain[i]?.key === from ? Math.min(i + 1, chain.length - 1) : i));
    },
    [chain],
  );
  const accept = useCallback((from: string) => {
    settled.current = from;
  }, []);

  const judge = useCallback(
    (img: HTMLImageElement, from: string) => {
      if (judgeLoadedImage(img.naturalWidth, img.naturalHeight) === 'ok') accept(from);
      else advance(from);
    },
    [accept, advance],
  );

  useEffect(() => {
    if (candidate.kind === 'panel') return;
    const key = candidate.key;
    settled.current = null;
    const img = imgRef.current;
    if (!img) return;

    // a cached image can finish before React attached onLoad (or before this
    // effect ran): look at it directly rather than wait for an event that
    // already happened
    // (a complete image with no size is left to onError: a lazy image that
    // hasn't been fetched yet can look the same, and must not be skipped)
    if (img.complete && img.naturalWidth > 0) {
      judge(img, key);
      return;
    }

    // the clock starts when the card is near the screen: a lazy image below
    // the fold isn't slow, it simply hasn't been asked for yet
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (timer === undefined) timer = setTimeout(() => advance(key), LOAD_TIMEOUT_MS);
    };
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'undefined') {
      start();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            start();
            observer?.disconnect();
          }
        },
        { rootMargin: '200px' },
      );
      observer.observe(img);
    }
    return () => {
      observer?.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [candidate.kind, candidate.key, advance, judge]);

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
        ref={imgRef}
        src={candidate.src}
        alt={candidate.kind === 'library' ? `Illustrative photo: ${candidate.photo.title}` : ''}
        loading="lazy"
        decoding="async"
        // hide which story a reader is on from other hosts; our own files don't need it
        referrerPolicy={isRemoteSrc(candidate.src) ? 'no-referrer' : undefined}
        onError={() => advance(candidate.key)}
        onLoad={(e) => {
          if (settled.current === candidate.key) return;
          judge(e.currentTarget, candidate.key);
        }}
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
