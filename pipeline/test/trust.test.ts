import { describe, expect, it } from 'vitest';
import { computeTrustScore } from '../src/trust.ts';
import type { NewsSource } from '../../shared/news.ts';

const src = (domain: string, reliability: number, bias: NewsSource['bias']): NewsSource => ({
  url: `https://${domain}/x`,
  domain,
  reliability,
  bias,
});

describe('computeTrustScore', () => {
  it('caps single-source stories at 40', () => {
    expect(computeTrustScore([src('reuters.com', 95, 'center')])).toBeLessThanOrEqual(40);
  });

  it('rewards corroboration across independent domains', () => {
    const two = computeTrustScore([
      src('reuters.com', 95, 'center'),
      src('bbc.com', 90, 'center'),
    ]);
    const four = computeTrustScore([
      src('reuters.com', 95, 'center'),
      src('bbc.com', 90, 'center'),
      src('apnews.com', 95, 'center'),
      src('dw.com', 86, 'center'),
    ]);
    expect(four).toBeGreaterThan(two);
    expect(two).toBeGreaterThan(40);
  });

  it('adds a cross-spectrum bonus when left and right outlets agree', () => {
    const sameSide = computeTrustScore([
      src('nytimes.com', 87, 'center-left'),
      src('theguardian.com', 84, 'center-left'),
    ]);
    const crossSpectrum = computeTrustScore([
      src('nytimes.com', 87, 'center-left'),
      src('wsj.com', 87, 'center-right'),
    ]);
    expect(crossSpectrum).toBeGreaterThan(sameSide);
  });

  it('duplicate domains do not count as corroboration', () => {
    const dupes = computeTrustScore([
      src('reuters.com', 95, 'center'),
      src('reuters.com', 95, 'center'),
    ]);
    expect(dupes).toBeLessThanOrEqual(40);
  });

  it('low-reliability piles stay low', () => {
    const junk = computeTrustScore([
      src('rt.com', 30, 'unknown'),
      src('sputniknews.com', 28, 'unknown'),
      src('presstv.ir', 30, 'unknown'),
    ]);
    expect(junk).toBeLessThan(60);
  });

  it('stays within 0-100', () => {
    const many = computeTrustScore([
      src('reuters.com', 95, 'center'),
      src('apnews.com', 95, 'center'),
      src('bbc.com', 90, 'center'),
      src('nytimes.com', 87, 'center-left'),
      src('wsj.com', 87, 'center-right'),
      src('ft.com', 90, 'center'),
    ]);
    expect(many).toBeLessThanOrEqual(100);
    expect(many).toBeGreaterThan(85);
  });
});
