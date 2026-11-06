import { describe, expect, it } from 'vitest';
import { MIN_FACING, nearestOnScreen, pickRadiusPx, PICK_RADIUS_PX } from './screenPick';

const c = (item: string, x: number, y: number, facing = 1) => ({ item, x, y, facing });

describe('pickRadiusPx', () => {
  it('gives a finger more reach than a cursor', () => {
    expect(pickRadiusPx('touch')).toBe(28);
    expect(pickRadiusPx('mouse')).toBe(14);
    expect(pickRadiusPx('pen')).toBe(PICK_RADIUS_PX.pen);
    expect(pickRadiusPx(undefined)).toBe(24);
    expect(pickRadiusPx('')).toBe(24);
  });
});

describe('nearestOnScreen', () => {
  it('picks the nearest story within reach', () => {
    expect(nearestOnScreen([c('a', 120, 100), c('b', 108, 100)], 100, 100, 28)).toBe('b');
  });

  it('ignores stories beyond the radius', () => {
    expect(nearestOnScreen([c('a', 130, 100)], 100, 100, 28)).toBeNull();
    expect(nearestOnScreen([c('a', 128, 100)], 100, 100, 28)).toBe('a');
    expect(nearestOnScreen([c('a', 115, 100)], 100, 100, 14)).toBeNull();
  });

  it('never picks a story on the far side of the globe', () => {
    expect(nearestOnScreen([c('back', 100, 100, -0.2)], 100, 100, 28)).toBeNull();
    expect(nearestOnScreen([c('limb', 100, 100, MIN_FACING / 2)], 100, 100, 28)).toBeNull();
    expect(nearestOnScreen([c('back', 101, 100, -0.5), c('front', 115, 100, 0.8)], 100, 100, 28)).toBe('front');
  });

  it('prefers a squarely visible story over a grazing one at about the same distance', () => {
    expect(nearestOnScreen([c('grazing', 110, 100, 0.06), c('visible', 100, 112, 0.9)], 100, 100, 28)).toBe('visible');
    // …but a much nearer grazing story still wins
    expect(nearestOnScreen([c('grazing', 102, 100, 0.06), c('visible', 100, 120, 0.9)], 100, 100, 28)).toBe('grazing');
  });

  it('is empty-safe', () => {
    expect(nearestOnScreen([], 0, 0, 28)).toBeNull();
  });
});
