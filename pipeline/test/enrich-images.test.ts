import { describe, expect, it } from 'vitest';
import { extractIconHref, extractOgImage } from '../src/enrich-images.ts';

describe('extractOgImage', () => {
  it('extracts a standard og:image tag', () => {
    const html = `<html><head>
      <meta property="og:title" content="Story" />
      <meta property="og:image" content="https://cdn.example.com/img/story.jpg?w=1200&amp;h=630" />
    </head><body/></html>`;
    expect(extractOgImage(html)).toBe('https://cdn.example.com/img/story.jpg?w=1200&h=630');
  });

  it('handles content-before-property attribute order', () => {
    const html = `<meta content="https://cdn.example.com/x.png" property="og:image">`;
    expect(extractOgImage(html)).toBe('https://cdn.example.com/x.png');
  });

  it('falls back to twitter:image (name attribute)', () => {
    const html = `<meta name="twitter:image" content="https://img.example.org/t.webp"/>`;
    expect(extractOgImage(html)).toBe('https://img.example.org/t.webp');
  });

  it('rejects non-https and unparsable URLs', () => {
    expect(extractOgImage(`<meta property="og:image" content="http://insecure.example/a.jpg">`)).toBeNull();
    expect(extractOgImage(`<meta property="og:image" content="/relative/path.jpg">`)).toBeNull();
  });

  it('returns null when no preview meta exists', () => {
    expect(extractOgImage('<html><head><title>x</title></head></html>')).toBeNull();
  });
});

describe('extractIconHref', () => {
  const page = 'https://www.example.com/world/story-123';

  it('prefers apple-touch-icon over rel=icon', () => {
    const html = `<head>
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
    </head>`;
    expect(extractIconHref(html, page)).toBe('https://www.example.com/apple-touch-icon-180.png');
  });

  it('resolves a relative href against the article URL', () => {
    const html = `<link rel="icon" href="../static/icon.png">`;
    expect(extractIconHref(html, page)).toBe('https://www.example.com/static/icon.png');
  });

  it('accepts an absolute href on another host (CDN-hosted icons)', () => {
    const html = `<link rel="shortcut icon" href="https://cdn.example.net/i/fav.png">`;
    expect(extractIconHref(html, page)).toBe('https://cdn.example.net/i/fav.png');
  });

  it('handles href-before-rel attribute order', () => {
    const html = `<link href="/f.png" rel="icon">`;
    expect(extractIconHref(html, page)).toBe('https://www.example.com/f.png');
  });

  it('rejects icons that would resolve to plain http', () => {
    expect(extractIconHref(`<link rel="icon" href="http://x.example/a.png">`, page)).toBeNull();
    // relative href on an http page inherits that scheme, so it is rejected too
    expect(extractIconHref(`<link rel="icon" href="/a.png">`, 'http://x.example/s')).toBeNull();
  });

  it('returns null when the head declares no icon', () => {
    expect(extractIconHref('<head><title>x</title></head>', page)).toBeNull();
  });
});
