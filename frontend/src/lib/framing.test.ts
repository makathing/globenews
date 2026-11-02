import { describe, expect, it } from 'vitest';
import { framedDiameter, framedDistance, PHONE_BAND_FILL, PHONE_WIDTH_FILL, viewOffsetX, viewOffsetY } from './framing';

/** The projected diameter (px) of the unit globe seen from `d`. */
function diameterAt(d: number, heightPx: number, fovDeg = 45) {
  const focal = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
  return (2 * focal) / Math.sqrt(d * d - 1);
}

describe('framing', () => {
  it('spans ~75–80% of a phone screen when the band is tall enough', () => {
    // 390×844: top bar ~56, peek ~215 → a 573px band, so width decides
    const d = framedDistance({ bandPx: 573, widthPx: 390, heightPx: 844, fovDeg: 45 });
    expect(diameterAt(d, 844)).toBeCloseTo(PHONE_WIDTH_FILL * 390, 5);
    expect(diameterAt(d, 844) / 390).toBeGreaterThanOrEqual(0.75);
    expect(diameterAt(d, 844) / 390).toBeLessThanOrEqual(0.8);
    // with room to spare above and below
    expect(573 - diameterAt(d, 844)).toBeGreaterThan(200);
  });

  it('never lets the globe clip a short band', () => {
    // landscape 844×390: a ~230px band between the top row and the sheet
    const d = framedDistance({ bandPx: 230, widthPx: 844, heightPx: 390, fovDeg: 45 });
    expect(diameterAt(d, 390)).toBeCloseTo(PHONE_BAND_FILL * 230, 5);
    expect(diameterAt(d, 390)).toBeLessThan(230);
    // a shorter band pushes the camera further out
    const tall = framedDistance({ bandPx: 400, widthPx: 390, heightPx: 844, fovDeg: 45 });
    const short = framedDistance({ bandPx: 200, widthPx: 390, heightPx: 844, fovDeg: 45 });
    expect(short).toBeGreaterThan(tall);
  });

  it('diameter is the smaller of the width and band limits', () => {
    expect(framedDiameter(600, 390)).toBeCloseTo(390 * PHONE_WIDTH_FILL);
    expect(framedDiameter(300, 390)).toBeCloseTo(300 * PHONE_BAND_FILL);
    expect(framedDiameter(10, 390)).toBe(48);
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
