import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../../shared/news';
import type { LibraryPhoto, PhotoLibrary } from '../../../shared/photoLibrary';
import { CATEGORY_DEFAULT_TOPIC, matchTopic, TOPICS } from '../../../shared/topics';
import {
  artChain,
  artChains,
  isRemoteSrc,
  judgeLoadedImage,
  pickLibraryPhoto,
  type ArtCandidate,
} from './illustration';

function story(id: string, overrides: Partial<NewsEvent> = {}): NewsEvent {
  return {
    id,
    headline: 'Parliament passes budget after marathon session',
    summary: '',
    category: 'politics',
    severity: 3,
    lat: 0,
    lon: 0,
    locationName: 'Somewhere',
    countryCode: 'XX',
    sources: [],
    trustScore: 60,
    firstSeen: '2026-10-01T00:00:00Z',
    lastUpdated: '2026-10-01T00:00:00Z',
    isBreaking: false,
    ...overrides,
  };
}

function photo(id: string): LibraryPhoto {
  return {
    id,
    thumb: `https://upload.example/${id}.jpg`,
    page: `https://commons.example/${id}`,
    title: id,
    author: 'A. Photographer',
    license: 'CC BY-SA 4.0',
    width: 960,
    height: 640,
  };
}

function library(topics: Record<string, LibraryPhoto[]>, blocked: string[] = []): PhotoLibrary {
  return { version: 1, builtAt: '2026-10-01T00:00:00Z', topics, blocked };
}

const EMPTY = library({});

const kinds = (chain: ArtCandidate[]) => chain.map((c) => c.kind);
const srcs = (chain: ArtCandidate[]) => chain.map((c) => ('src' in c ? c.src : 'panel'));
const libraryIds = (chain: ArtCandidate[]) =>
  chain.flatMap((c) => (c.kind === 'library' ? [c.photo.id] : []));

/** A story whose matched topic differs from its category's default, when the topic table allows one. */
function specificStory(): { event: NewsEvent; topic: string; fallback: string } | null {
  for (const topic of TOPICS) {
    const fallback = CATEGORY_DEFAULT_TOPIC[topic.category];
    const keywords: readonly string[] = topic.keywords;
    if (topic.id === fallback || keywords.length === 0) continue;
    const event = story('specific', {
      category: topic.category,
      headline: `${keywords[0]} ${keywords[1] ?? ''}`.trim(),
    });
    if (matchTopic(event) === topic.id) return { event, topic: topic.id, fallback };
  }
  return null;
}

describe('artChain', () => {
  it('orders the hero, then each source image, then the colour panel', () => {
    const event = story('a', {
      image: { url: 'https://cdn.a.com/hero.jpg', domain: 'a.com' },
      sources: [
        { url: 'https://a.com/1', domain: 'a.com', reliability: 80, bias: 'center', image: 'https://cdn.a.com/hero.jpg' },
        { url: 'https://b.com/1', domain: 'b.com', reliability: 80, bias: 'center' },
        { url: 'https://c.com/1', domain: 'c.com', reliability: 80, bias: 'center', image: 'https://cdn.c.com/c.jpg' },
      ],
    });
    const chain = artChain(event, EMPTY);
    // the hero repeated as a source image is tried once, not twice
    expect(srcs(chain)).toEqual(['https://cdn.a.com/hero.jpg', 'https://cdn.c.com/c.jpg', 'panel']);
    expect(chain[0]).toMatchObject({ kind: 'source', credit: 'via a.com' });
    expect(chain[1]).toMatchObject({ kind: 'source', credit: 'via c.com' });
  });

  it('with an empty library, offers only the real images and the colour panel', () => {
    expect(kinds(artChain(story('b'), EMPTY))).toEqual(['panel']);
    const withImage = story('b', { image: { url: 'https://img.x.com/y.jpg', domain: 'x.com' } });
    expect(kinds(artChain(withImage, EMPTY))).toEqual(['source', 'panel']);
  });

  it('puts the topic photo after the real images and before the panel', () => {
    const event = story('c', { image: { url: 'https://img.x.com/y.jpg', domain: 'x.com' } });
    const topic = matchTopic(event);
    const chain = artChain(event, library({ [topic]: [photo('p1')] }));
    expect(kinds(chain)).toEqual(['source', 'library', 'panel']);
    expect(chain[1]).toMatchObject({ kind: 'library', topic, src: 'https://upload.example/p1.jpg' });
  });

  it("falls back to the category's default topic", () => {
    const event = story('d');
    const fallback = CATEGORY_DEFAULT_TOPIC[event.category];
    const chain = artChain(event, library({ [fallback]: [photo('f1')] }));
    expect(kinds(chain)).toEqual(['library', 'panel']);
    expect(chain[0]).toMatchObject({ topic: fallback });
  });

  it('tries the specific topic before the category default', () => {
    const found = specificStory();
    expect(found).not.toBeNull();
    if (!found) return;
    const chain = artChain(
      found.event,
      library({ [found.topic]: [photo('t1')], [found.fallback]: [photo('f1')] }),
    );
    expect(libraryIds(chain)).toEqual(['t1', 'f1']);
    expect(chain.map((c) => (c.kind === 'library' ? c.topic : c.kind))).toEqual([
      found.topic,
      found.fallback,
      'panel',
    ]);
  });

  it('skips blocked photos, and a topic with only blocked photos', () => {
    const event = story('e');
    const topic = matchTopic(event);
    const chain = artChain(event, library({ [topic]: [photo('x1'), photo('x2')] }, ['x1']));
    expect(libraryIds(chain)).toEqual(['x2']);
    const allBlocked = artChain(event, library({ [topic]: [photo('x1')] }, ['x1']));
    expect(kinds(allBlocked)).toEqual(['panel']);
  });

  it('draws the same photo for the same story, every time', () => {
    const photos = Array.from({ length: 7 }, (_, i) => photo(`p${i}`));
    const event = story('stable-id');
    const lib = library({ [matchTopic(event)]: photos });
    const first = libraryIds(artChain(event, lib));
    for (let i = 0; i < 5; i++) expect(libraryIds(artChain(event, lib))).toEqual(first);
    // and different stories spread over the topic's photos
    const drawn = new Set(
      Array.from({ length: 30 }, (_, i) => libraryIds(artChain(story(`s${i}`), lib))[0]),
    );
    expect(drawn.size).toBeGreaterThan(3);
  });
});

describe('avoid set', () => {
  it('prefers a photo not already used, and repeats only when all are taken', () => {
    const photos = [photo('a'), photo('b'), photo('c')];
    const blocked = new Set<string>();
    const base = pickLibraryPhoto(photos, 'seed', blocked)!;
    const other = pickLibraryPhoto(photos, 'seed', blocked, new Set([base.id]))!;
    expect(other.id).not.toBe(base.id);
    expect(pickLibraryPhoto(photos, 'seed', blocked, new Set(['a', 'b', 'c']))!.id).toBe(base.id);
  });

  it('spreads photos across a list of cards that have no art of their own', () => {
    const photos = [photo('a'), photo('b'), photo('c')];
    const events = [story('one'), story('two'), story('three')];
    const lib = library({ [matchTopic(events[0])]: photos });
    const chains = artChains(events, lib);
    const firsts = events.map((e) => libraryIds(chains.get(e.id)!)[0]);
    expect(new Set(firsts).size).toBe(3);
  });

  it('does not let stories with their own art claim library photos', () => {
    const photos = [photo('a'), photo('b')];
    const withArt = story('art', { image: { url: 'https://img.x.com/y.jpg', domain: 'x.com' } });
    const bare = story('bare');
    const lib = library({ [matchTopic(bare)]: photos });
    const alone = libraryIds(artChain(bare, lib))[0];
    const chains = artChains([withArt, bare], lib);
    expect(libraryIds(chains.get('bare')!)[0]).toBe(alone);
  });
});

describe('self-hosted library photos', () => {
  const local = (id: string): LibraryPhoto => ({ ...photo(id), local: `library/${id}.webp` });

  it("tries the site's own copy before the Commons thumbnail, and the panel only after both", () => {
    const event = story('l1');
    const chain = artChain(event, library({ [matchTopic(event)]: [local('p1')] }), undefined, './');
    expect(srcs(chain)).toEqual(['./library/p1.webp', 'https://upload.example/p1.jpg', 'panel']);
    expect(chain[0]).toMatchObject({ kind: 'library', selfHosted: true });
    expect(chain[1]).toMatchObject({ kind: 'library', selfHosted: false });
  });

  it('keeps each photo\'s two copies together, topic photo before the category default', () => {
    const found = specificStory();
    if (!found) return;
    const chain = artChain(
      found.event,
      library({ [found.topic]: [local('t1')], [found.fallback]: [local('f1')] }),
      undefined,
      '/',
    );
    expect(srcs(chain)).toEqual([
      '/library/t1.webp',
      'https://upload.example/t1.jpg',
      '/library/f1.webp',
      'https://upload.example/f1.jpg',
      'panel',
    ]);
  });

  it('a photo with no self-hosted copy is just its thumbnail', () => {
    const event = story('l2');
    const chain = artChain(event, library({ [matchTopic(event)]: [photo('p1')] }));
    expect(srcs(chain)).toEqual(['https://upload.example/p1.jpg', 'panel']);
  });

  it('spreading across cards still counts a self-hosted photo as used', () => {
    const photos = [local('a'), local('b')];
    const events = [story('one'), story('two')];
    const chains = artChains(events, library({ [matchTopic(events[0])]: photos }));
    const firsts = events.map((e) => libraryIds(chains.get(e.id)!)[0]);
    expect(new Set(firsts).size).toBe(2);
  });
});

describe('outlet branding in an older dataset', () => {
  it('skips logos and share cards, so the story falls through to a library photo', () => {
    const event = story('brand', {
      image: { url: 'https://media.npr.org/include/images/facebook-default-wide-s1400-c85.jpg', domain: 'npr.org' },
      sources: [
        {
          url: 'https://www.pbs.org/a',
          domain: 'pbs.org',
          reliability: 80,
          bias: 'center',
          image: 'https://www.pbs.org/images/pbs_share_og.png',
        },
        {
          url: 'https://news.un.org/a',
          domain: 'un.org',
          reliability: 80,
          bias: 'center',
          image: 'https://news.un.orginternal/sites/un-emblem-for-rss.png',
        },
      ],
    });
    const chain = artChain(event, library({ [matchTopic(event)]: [photo('p1')] }));
    expect(kinds(chain)).toEqual(['library', 'panel']);
  });
});

describe('judgeLoadedImage', () => {
  it('accepts an ordinary landscape or portrait photo', () => {
    expect(judgeLoadedImage(1200, 630)).toBe('ok');
    expect(judgeLoadedImage(640, 427)).toBe('ok');
    expect(judgeLoadedImage(600, 900)).toBe('ok');
    expect(judgeLoadedImage(200, 200)).toBe('ok');
  });

  it('rejects pixels, icons and thumbnails narrower than 200px', () => {
    expect(judgeLoadedImage(1, 1)).toBe('too-small');
    expect(judgeLoadedImage(180, 180)).toBe('too-small');
    expect(judgeLoadedImage(199, 120)).toBe('too-small');
    expect(judgeLoadedImage(0, 0)).toBe('too-small');
    expect(judgeLoadedImage(Number.NaN, 100)).toBe('too-small');
  });

  it('rejects banners and wordmarks more extreme than 4:1', () => {
    expect(judgeLoadedImage(1200, 200)).toBe('bad-shape');
    expect(judgeLoadedImage(300, 1500)).toBe('bad-shape');
    expect(judgeLoadedImage(800, 200)).toBe('ok');
  });
});

describe('isRemoteSrc', () => {
  it('tells hotlinks from the site\'s own files', () => {
    expect(isRemoteSrc('https://upload.wikimedia.org/x.jpg')).toBe(true);
    expect(isRemoteSrc('//cdn.example.com/x.jpg')).toBe(true);
    expect(isRemoteSrc('./library/abc.webp')).toBe(false);
    expect(isRemoteSrc('/library/abc.webp')).toBe(false);
  });
});
