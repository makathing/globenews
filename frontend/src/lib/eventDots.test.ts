import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../../shared/news';
import {
  buildEventDots,
  continuousDotLevel,
  DOT_GRID,
  DOT_LEVELS,
  footprintDegrees,
  footprintFor,
  pickDotLevel,
} from './eventDots';
import { categoryPalette } from './categoryColors';

function story(id: string, overrides: Partial<NewsEvent>): NewsEvent {
  return {
    id,
    headline: id,
    summary: '',
    category: 'politics',
    severity: 3,
    lat: 48.86,
    lon: 2.35,
    locationName: '',
    countryCode: 'FR',
    sources: [],
    trustScore: 80,
    firstSeen: '2026-10-26T00:00:00Z',
    lastUpdated: '2026-10-26T00:00:00Z',
    isBreaking: false,
    ...overrides,
  };
}

/** The previous behaviour: the max-weight story owns each dot. */
function maxWeightReference(events: NewsEvent[], light: boolean) {
  const { width: W, height: H } = DOT_GRID;
  const color = new Uint8Array(W * H * 4);
  const pulse = new Uint8Array(W * H * 4);
  const palette = categoryPalette(light);
  const deg = Math.PI / 180;
  events.forEach((event, index) => {
    const radius = footprintDegrees(event.severity);
    const hex = parseInt(palette[event.category].slice(1), 16);
    const phase = Math.round(((index * 1.7) % (Math.PI * 2)) / (Math.PI * 2) * 255);
    const sinLat = Math.sin(event.lat * deg);
    const cosLat = Math.cos(event.lat * deg);
    const rowFrom = Math.max(0, Math.floor(((event.lat - radius + 90) / 180) * H));
    const rowTo = Math.min(H - 1, Math.ceil(((event.lat + radius + 90) / 180) * H));
    const lonSpan = radius / Math.max(0.15, cosLat);
    const colFrom = Math.floor(((event.lon - lonSpan + 180) / 360) * W);
    const colTo = Math.ceil(((event.lon + lonSpan + 180) / 360) * W);
    for (let row = rowFrom; row <= rowTo; row++) {
      const lat = (-90 + ((row + 0.5) * 180) / H) * deg;
      for (let c = colFrom; c <= colTo; c++) {
        const col = ((c % W) + W) % W;
        const lon = (-180 + ((col + 0.5) * 360) / W) * deg;
        const cos = sinLat * Math.sin(lat) + cosLat * Math.cos(lat) * Math.cos(lon - event.lon * deg);
        const distance = Math.acos(Math.min(1, cos)) / deg;
        if (distance > radius) continue;
        const weight = Math.max(1, Math.round((1 - distance / radius) * 255));
        const i = (row * W + col) * 4;
        if (weight <= color[i + 3]) continue;
        color.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, weight], i);
        pulse[i] = event.severity >= 4 ? 255 : 0;
        pulse[i + 1] = phase;
      }
    }
  });
  return { color, pulse };
}

const bytes = (texture: { image: { data: unknown } }) => texture.image.data as Uint8Array;

/** Index of the first differing byte, or -1 (cheaper than a deep equal over 350k bytes). */
function firstDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

describe('buildEventDots', () => {
  it('leaves stories that do not overlap exactly as the max-weight rule had them', () => {
    const events = [
      story('paris', { severity: 4 }),
      story('lima', { category: 'climate', severity: 2, lat: -12.05, lon: -77.04 }),
      story('dateline', { category: 'science', severity: 5, lat: 10, lon: 179.8 }),
    ];
    const built = buildEventDots(events, false);
    const reference = maxWeightReference(events, false);
    expect(firstDifference(bytes(built.color), reference.color)).toBe(-1);
    expect(firstDifference(bytes(built.pulse), reference.pulse)).toBe(-1);
  });

  it('shares the dots of two co-located stories by weight', () => {
    // a footprint is only a handful of dots, so sample many co-located pairs
    const events: NewsEvent[] = [];
    for (let k = 0; k < 40; k++) {
      const at = { lat: -60 + (k % 8) * 15, lon: -170 + Math.floor(k / 8) * 70 };
      events.push(story(`p${k}`, { category: 'politics', ...at }), story(`s${k}`, { category: 'society', ...at }));
    }
    const color = bytes(buildEventDots(events, false).color);
    const palette = categoryPalette(false);
    const red = (category: 'politics' | 'society') => parseInt(palette[category].slice(1, 3), 16);
    let politics = 0;
    let society = 0;
    for (let i = 0; i < color.length; i += 4) {
      if (color[i + 3] === 0) continue;
      if (color[i] === red('politics')) politics++;
      else if (color[i] === red('society')) society++;
    }
    const total = politics + society;
    expect(total).toBeGreaterThan(100);
    expect(politics / total).toBeGreaterThan(0.3);
    expect(politics / total).toBeLessThan(0.7);
  });

  it('is deterministic across builds', () => {
    const events = [
      story('a', { category: 'politics' }),
      story('b', { category: 'society' }),
      story('c', { category: 'economy', severity: 5, lat: 48.5, lon: 2.8 }),
      story('d', { category: 'conflict', severity: 2, lat: 49, lon: 2 }),
    ];
    const first = buildEventDots(events, true);
    const second = buildEventDots(events, true);
    expect(firstDifference(bytes(first.color), bytes(second.color))).toBe(-1);
    expect(firstDifference(bytes(first.pulse), bytes(second.pulse))).toBe(-1);
  });
});

describe('dot levels', () => {
  it('keeps the approved footprint on the base grid and widens it on fine grids', () => {
    for (let severity = 1; severity <= 5; severity++) {
      expect(footprintFor(severity, 420)).toBe(footprintDegrees(severity));
      expect(footprintFor(severity, 960)).toBeGreaterThanOrEqual(1.6 * (180 / 480));
    }
    expect(buildEventDots([story('x', {})], false, 960).color.image.width).toBe(960);
  });

  it('lights a centre dot and its neighbours for a small story on the finest grid', () => {
    const built = buildEventDots([story('small', { severity: 1 })], false, DOT_LEVELS[DOT_LEVELS.length - 1]);
    const color = bytes(built.color);
    let lit = 0;
    for (let i = 3; i < color.length; i += 4) if (color[i] > 0) lit++;
    expect(lit).toBeGreaterThanOrEqual(5);
  });

  // projected globe radius in CSS px: (h/2)/tan(fov/2) * R/sqrt(d^2 - R^2)
  const radiusPx = (viewportHeight: number, distance: number) =>
    (viewportHeight / 2 / Math.tan((45 * Math.PI) / 360)) / Math.sqrt(distance * distance - 1);

  it('stays on the base grid at the default framings', () => {
    expect(continuousDotLevel(radiusPx(900, 4.3))).toBeLessThan(0.5);
    expect(continuousDotLevel(radiusPx(844, 5.59))).toBe(0);
    expect(pickDotLevel(continuousDotLevel(radiusPx(900, 4.3)), 0)).toBe(0);
    expect(continuousDotLevel(radiusPx(900, 8))).toBe(0);
  });

  it('reaches the finest grid at the closest zoom and moves monotonically', () => {
    expect(pickDotLevel(continuousDotLevel(radiusPx(900, 1.75)), 0)).toBe(DOT_LEVELS.length - 1);
    let previous = -1;
    for (let d = 8; d >= 1.75; d -= 0.01) {
      const level = continuousDotLevel(radiusPx(900, d));
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('steps between grids with hysteresis', () => {
    expect(pickDotLevel(0.99, 0)).toBe(0);
    expect(pickDotLevel(1.0, 0)).toBe(1);
    expect(pickDotLevel(0.9, 1)).toBe(1); // resting just below the boundary keeps the finer grid
    expect(pickDotLevel(0.8, 1)).toBe(0);
    expect(pickDotLevel(0.2, 3)).toBe(0);
    expect(pickDotLevel(2.95, 3)).toBe(3);
  });
});
