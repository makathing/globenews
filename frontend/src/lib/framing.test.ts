import { describe, expect, it } from 'vitest';
import { framedDistance, viewOffsetX, viewOffsetY } from './framing';

describe('framing', () => {
  it('fits the globe diameter to the band', () => {
    const d = framedDistance({ bandPx: 400, widthPx: 390, heightPx: 844, fovDeg: 45, fill: 0.86 });
    // projected radius back out of the distance
    const focal = 844 / 2 / Math.tan((45 * Math.PI) / 360);
    const radius = focal / Math.sqrt(d * d - 1);
    expect(radius * 2).toBeCloseTo(0.86 * 390, 5);
    // a taller band is limited by the width; a shorter one by itself
    const short = framedDistance({ bandPx: 200, widthPx: 390, heightPx: 844, fovDeg: 45 });
    expect(short).toBeGreaterThan(d);
  });

  it('centres the band', () => {
    // top bar 110, sheet 330 on an 844 screen: band centre 422 - 110 above the middle
    expect(viewOffsetY(110, 330)).toBe(110);
    expect(viewOffsetY(0, 0)).toBe(0);
    expect(viewOffsetY(120, 40)).toBe(-40);
    // desktop: a 300px rail on the left moves the globe right by half of it
    expect(viewOffsetX(300, 0)).toBe(-150);
    expect(viewOffsetX(300, 400)).toBe(50);
  });
});
