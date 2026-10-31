import { describe, expect, it } from 'vitest';
import { clampDrag, nextSnap, resolveSnap, SHEET_HEADER_PX, snapHeights, stepSnap } from './sheet';

describe('snapHeights', () => {
  it('orders peek < half < full on phones', () => {
    for (const [h, top] of [
      [844, 116],
      [780, 112],
      [667, 104],
      [568, 100],
    ]) {
      const s = snapHeights(h, top);
      expect(s.peek).toBeLessThan(s.half);
      expect(s.half).toBeLessThan(s.full);
      expect(s.full).toBe(h - top - 8);
      expect(s.peek).toBeLessThanOrEqual(Math.max(SHEET_HEADER_PX, h * 0.4));
    }
  });

  it('peeks just the header in landscape', () => {
    const s = snapHeights(390, 60);
    expect(s.peek).toBe(SHEET_HEADER_PX);
    expect(s.half).toBe(234);
    expect(s.full).toBe(322);
  });
});

describe('resolveSnap', () => {
  const s = { peek: 300, half: 490, full: 720 };

  it('settles on the nearest snap after a slow release', () => {
    expect(resolveSnap(320, 0, s)).toBe('peek');
    expect(resolveSnap(420, 0, s)).toBe('half');
    expect(resolveSnap(650, 0, s)).toBe('full');
    // a slow push upward carries a little further
    expect(resolveSnap(380, 0.4, s)).toBe('half');
  });

  it('a flick moves one snap in its direction', () => {
    expect(resolveSnap(310, 1.2, s)).toBe('half');
    expect(resolveSnap(500, 1.2, s)).toBe('full');
    expect(resolveSnap(480, -1, s)).toBe('peek');
    expect(resolveSnap(700, -1, s)).toBe('half');
    expect(resolveSnap(760, 2, s)).toBe('full');
    expect(resolveSnap(250, -2, s)).toBe('peek');
  });
});

describe('stepping', () => {
  it('cycles and steps', () => {
    expect(nextSnap('peek')).toBe('half');
    expect(nextSnap('half')).toBe('full');
    expect(nextSnap('full')).toBe('peek');
    expect(stepSnap('peek', -1)).toBe('peek');
    expect(stepSnap('half', 1)).toBe('full');
    expect(stepSnap('full', 1)).toBe('full');
  });

  it('rubber-bands past the ends', () => {
    const s = { peek: 300, half: 490, full: 720 };
    expect(clampDrag(500, s)).toBe(500);
    expect(clampDrag(820, s)).toBe(740);
    expect(clampDrag(200, s)).toBe(265);
  });
});
