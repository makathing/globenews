import { describe, expect, it } from 'vitest';
import { outletHue, outletInitials, outletName } from './outlets';

describe('outlets', () => {
  it('names known outlets and title-cases the rest', () => {
    expect(outletName('aljazeera.com')).toBe('Al Jazeera');
    expect(outletName('www.cnn.com')).toBe('CNN');
    expect(outletName('japantimes.co.jp')).toBe('Japan Times');
    expect(outletName('riotimes-online.com.br')).toBe('Riotimes Online');
    expect(outletName('ft.lk')).toBe('FT');
  });

  it('makes one- or two-letter monograms', () => {
    expect(outletInitials('aljazeera.com')).toBe('AJ');
    expect(outletInitials('bloomberg.com')).toBe('B');
    expect(outletInitials('cbsnews.com')).toBe('CB');
  });

  it('gives an outlet the same hue everywhere', () => {
    expect(outletHue('www.cnn.com')).toBe(outletHue('cnn.com'));
    expect(outletHue('cnn.com')).toBeGreaterThanOrEqual(0);
    expect(outletHue('cnn.com')).toBeLessThan(360);
  });
});
