import { describe, expect, it } from 'vitest';
import { extractOgImage } from '../src/enrich-images.ts';

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
