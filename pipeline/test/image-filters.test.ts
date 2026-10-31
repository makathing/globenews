import { describe, expect, it } from 'vitest';
import type { NewsDataset, NewsEvent, NewsSource } from '../../shared/news.ts';
import { imageRejectionReason, isPlausibleHostname, isStoryImage } from '../../shared/imageFilters.ts';
import {
  extractOgImageWidth,
  extractStoryImage,
  resolveImageUrl,
  scrubStoryImages,
} from '../src/enrich-images.ts';

// Every one of these was served as a "story image" on the live site and read
// to a visitor as "just an icon".
const SEEN_ON_THE_SITE = [
  'https://media.npr.org/include/images/facebook-default-wide-s1400-c85.jpg',
  'https://www.pbs.org/images/pbs_share_og.png',
  'https://www.whitehouse.gov/wp-content/uploads/2025/03/WH47-Social-Share-Card.jpg',
  'https://i.tribune.com.pk/media/images/logos/tribune-logo.webp',
  'https://phys.b-cdn.net/tmpl/v5/img/phys_308px.png',
  'https://news.un.orginternal/sites/news/files/un-emblem-for-rss.png',
];

// Real story photos, including CDN paths that carry words like "default".
const STORY_PHOTOS = [
  'https://dims.apnews.com/dims4/default/2c1d5e0/2147483647/strip/true/crop/5000x2813+0+260/resize/1440x810!/quality/90/?url=https%3A%2F%2Fassets.apnews.com%2Fab%2Fcd%2Fphoto.jpg',
  'https://ichef.bbci.co.uk/news/1024/branded_news/1a2b/live/flooded-street.jpg',
  'https://i.guim.co.uk/img/media/abc123/0_0_5000_3000/master/5000.jpg?width=1200&quality=85',
  'https://www.reuters.com/resizer/v2/ABCDEF.jpg?auth=xyz&width=1200&quality=80',
  'https://cdn.example.com/2026/10/iconic-bridge-reopens.jpg',
  'https://cdn.example.com/2026/10/government-defaulting-on-debt.jpg',
  'https://res.cloudinary.com/outlet/image/upload/t_default/v1/story/protest.jpg',
  'https://i.cbc.ca/1.7000000.1700000000!/fileImage/httpImage/image.jpg_gen/derivatives/16x9_1180/wildfire.jpg',
];

describe('imageRejectionReason (shared/imageFilters.ts)', () => {
  it.each(SEEN_ON_THE_SITE)('rejects outlet branding: %s', (url) => {
    expect(imageRejectionReason(url)).not.toBeNull();
  });

  it.each(STORY_PHOTOS)('keeps a story photo: %s', (url) => {
    expect(imageRejectionReason(url)).toBeNull();
  });

  it.each([
    ['logo token', 'https://cdn.x.com/img/site-logo.png'],
    ['glued logo', 'https://cdn.x.com/img/nprlogo.png'],
    ['logo folder', 'https://cdn.x.com/logos/2024/main.png'],
    ['emblem', 'https://cdn.x.com/a/emblem.png'],
    ['favicon', 'https://cdn.x.com/favicon-192.png'],
    ['default', 'https://cdn.x.com/img/default.jpg'],
    ['og-default', 'https://cdn.x.com/img/og-default.jpg'],
    ['social share', 'https://cdn.x.com/img/social_share.jpg'],
    ['share card', 'https://cdn.x.com/img/ShareCard.jpg'.replace('ShareCard', 'share-card')],
    ['share og', 'https://cdn.x.com/img/x_share_og.png'],
    ['placeholder', 'https://cdn.x.com/img/placeholder-16x9.jpg'],
    ['fallback', 'https://cdn.x.com/img/fallback.jpg'],
    ['sprite', 'https://cdn.x.com/img/sprite.png'],
    ['icon', 'https://cdn.x.com/img/app-icon.png'],
    ['avatar', 'https://cdn.x.com/u/avatar.jpg'],
    ['tmpl folder', 'https://cdn.x.com/tmpl/hero.jpg'],
    ['themes folder', 'https://x.com/wp-content/themes/news/og.jpg'],
    ['site-wide include/images', 'https://media.x.org/include/images/brand-wide.jpg'],
    ['px width hint', 'https://cdn.x.com/img/thumb_150px.jpg'],
    ['WxH width hint', 'https://cdn.x.com/img/story-320x180.jpg'],
    ['width query', 'https://cdn.x.com/img/story.jpg?w=200'],
  ])('rejects %s', (_label, url) => {
    expect(isStoryImage(url)).toBe(false);
  });

  it('rejects an image the page declares narrower than 400px', () => {
    expect(imageRejectionReason('https://cdn.x.com/story.jpg', 300)).toMatch(/too small/);
    expect(imageRejectionReason('https://cdn.x.com/story.jpg', 1200)).toBeNull();
  });

  it('rejects http, junk and implausible hosts', () => {
    expect(isStoryImage('http://cdn.x.com/story.jpg')).toBe(false);
    expect(isStoryImage('not a url')).toBe(false);
    expect(isStoryImage('https://localhost/story.jpg')).toBe(false);
    expect(isStoryImage('https://10.0.0.1/story.jpg')).toBe(false);
  });
});

describe('isPlausibleHostname', () => {
  it('accepts ordinary, country-code, long and punycode TLDs', () => {
    for (const host of ['news.un.org', 'i.tribune.com.pk', 'ichef.bbci.co.uk', 'cdn.outlet.news', 'xn--80ak6aa92e.xn--p1ai']) {
      expect(isPlausibleHostname(host)).toBe(true);
    }
  });

  it('rejects a page host glued to a relative path', () => {
    expect(isPlausibleHostname('news.un.orginternal')).toBe(false);
    expect(isPlausibleHostname('example.comimages')).toBe(false);
    expect(isPlausibleHostname('nodot')).toBe(false);
  });
});

describe('resolveImageUrl', () => {
  const page = 'https://news.un.org/en/story/2026/10/1168689';

  it('resolves relative og:image values against the article, not by concatenation', () => {
    expect(resolveImageUrl('internal/photo.jpg', 'https://news.un.org/')).toBe('https://news.un.org/internal/photo.jpg');
    expect(resolveImageUrl('/sites/news/files/photo.jpg', page)).toBe('https://news.un.org/sites/news/files/photo.jpg');
    expect(resolveImageUrl('//cdn.un.org/photo.jpg', page)).toBe('https://cdn.un.org/photo.jpg');
  });

  it('refuses a glued host the page itself emitted', () => {
    expect(resolveImageUrl('https://news.un.orginternal/sites/news/files/x.png', page)).toBeNull();
  });

  it('decodes &amp; and refuses http', () => {
    expect(resolveImageUrl('https://x.com/a.jpg?w=1&amp;h=2')).toBe('https://x.com/a.jpg?w=1&h=2');
    expect(resolveImageUrl('http://x.com/a.jpg', page)).toBeNull();
  });
});

describe('extractStoryImage', () => {
  const page = 'https://www.npr.org/2026/10/30/story';

  it('returns the og:image when it is a story photo', () => {
    const html = `<meta property="og:image" content="/assets/img/2026/10/30/flood_wide.jpg">`;
    expect(extractStoryImage(html, page)).toBe('https://www.npr.org/assets/img/2026/10/30/flood_wide.jpg');
  });

  it("returns null when the only og:image is the outlet's default", () => {
    const html = `<meta property="og:image" content="https://media.npr.org/include/images/facebook-default-wide-s1400-c85.jpg">`;
    expect(extractStoryImage(html, page)).toBeNull();
  });

  it('returns null when the page declares a tiny image', () => {
    const html = `<meta property="og:image" content="https://cdn.x.com/story.jpg"><meta property="og:image:width" content="200">`;
    expect(extractOgImageWidth(html)).toBe(200);
    expect(extractStoryImage(html, page)).toBeNull();
  });

  it('skips a broken first og:image for a later usable one', () => {
    const html = `<meta property="og:image" content="https://news.un.orginternal/x.png">
      <meta name="twitter:image" content="https://cdn.un.org/story-photo.jpg">`;
    expect(extractStoryImage(html, 'https://news.un.org/en/story/1')).toBe('https://cdn.un.org/story-photo.jpg');
  });
});

describe('scrubStoryImages', () => {
  const source = (url: string, image?: string): NewsSource => ({
    url,
    domain: new URL(url).hostname.replace(/^www\./, ''),
    reliability: 80,
    bias: 'center',
    ...(image ? { image } : {}),
  });
  const event = (id: string, sources: NewsSource[], hero?: { url: string; domain: string }): NewsEvent => ({
    id,
    headline: id,
    summary: '',
    category: 'world',
    severity: 3,
    lat: 0,
    lon: 0,
    locationName: 'X',
    countryCode: 'XX',
    sources,
    trustScore: 70,
    firstSeen: '2026-10-01T00:00:00Z',
    lastUpdated: '2026-10-01T00:00:00Z',
    isBreaking: false,
    ...(hero ? { image: hero } : {}),
  });
  const dataset = (events: NewsEvent[]) => ({ events }) as unknown as NewsDataset;

  it("drops an image one outlet uses on several different stories (the outlet's default)", () => {
    const shared = 'https://media.outlet.com/img/brand-wide-s1400.jpg';
    const own = 'https://media.outlet.com/img/2026/10/a-real-photo.jpg';
    const ds = dataset([
      event('a', [source('https://outlet.com/a', shared)], { url: shared, domain: 'outlet.com' }),
      event('b', [source('https://outlet.com/b', shared)], { url: shared, domain: 'outlet.com' }),
      event('c', [source('https://outlet.com/c', own)], { url: own, domain: 'outlet.com' }),
    ]);
    expect(scrubStoryImages(ds)).toBe(4);
    expect(ds.events[0].image).toBeUndefined();
    expect(ds.events[0].sources[0].image).toBeUndefined();
    expect(ds.events[1].image).toBeUndefined();
    expect(ds.events[2].image?.url).toBe(own);
  });

  it('keeps one image used twice within the same story', () => {
    const img = 'https://cdn.outlet.com/story/photo.jpg';
    const ds = dataset([
      event('a', [source('https://outlet.com/a', img), source('https://outlet.com/a2', img)], {
        url: img,
        domain: 'outlet.com',
      }),
    ]);
    expect(scrubStoryImages(ds)).toBe(0);
    expect(ds.events[0].image?.url).toBe(img);
  });

  it('removes branding and re-picks the hero from what is left', () => {
    const logo = 'https://i.tribune.com.pk/media/images/logos/tribune-logo.webp';
    const photo = 'https://ichef.bbci.co.uk/news/1024/branded_news/story.jpg';
    const ds = dataset([
      event(
        'a',
        [source('https://tribune.com.pk/a', logo), source('https://www.bbc.co.uk/news/a', photo)],
        { url: logo, domain: 'tribune.com.pk' },
      ),
    ]);
    expect(scrubStoryImages(ds)).toBe(2);
    expect(ds.events[0].image).toEqual({ url: photo, domain: 'bbc.co.uk' });
    expect(ds.events[0].sources.map((s) => s.image)).toEqual([undefined, photo]);
  });

  it('leaves no hero when every image was branding', () => {
    const ds = dataset([
      event('a', [source('https://www.pbs.org/a', 'https://www.pbs.org/images/pbs_share_og.png')], {
        url: 'https://www.pbs.org/images/pbs_share_og.png',
        domain: 'pbs.org',
      }),
    ]);
    scrubStoryImages(ds);
    expect(ds.events[0].image).toBeUndefined();
    expect(ds.events[0].sources[0].image).toBeUndefined();
  });
});
