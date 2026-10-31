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
  pulsePhaseByte,
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
  events.forEach((event) => {
    const radius = footprintDegrees(event.severity);
    const hex = parseInt(palette[event.category].slice(1), 16);
    // the one intended change from the old rule: the phase follows the id, not the array index
    const phase = pulsePhaseByte(event.id);
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

describe('stability across dataset updates', () => {
  // a busy cluster (more than three stories overlap, so slot replacement and
  // the dither both matter) plus a few loners elsewhere
  const cluster = Array.from({ length: 7 }, (_, k) =>
    story(`cluster-${k}`, {
      category: (['politics', 'society', 'economy', 'conflict'] as const)[k % 4],
      severity: (1 + (k % 5)) as NewsEvent['severity'],
      lat: 50 + (k % 3) * 0.4,
      lon: 8 + (k % 2) * 0.5,
    }),
  );
  const loners = [
    story('tokyo', { category: 'science', severity: 4, lat: 35.68, lon: 139.69 }),
    story('nairobi', { category: 'health', severity: 2, lat: -1.29, lon: 36.82 }),
    story('dateline', { category: 'climate', severity: 5, lat: -17, lon: 179.9 }),
  ];
  const base = [...cluster, ...loners];
  const unrelated = story('santiago', { category: 'disaster', severity: 5, lat: -33.45, lon: -70.67 });

  /** Indices of texels that differ, compared as whole RGBA texels. */
  function changedTexels(a: Uint8Array, b: Uint8Array): number[] {
    const out: number[] = [];
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) out.push(i / 4);
    }
    return out;
  }

  for (const width of DOT_LEVELS) {
    it(`leaves every other texel byte-identical when an unrelated story comes or goes (${width})`, () => {
      const before = buildEventDots(base, false, width);
      // inserted in the middle of the array, which used to shift every index after it
      const withNew = [...base.slice(0, 4), unrelated, ...base.slice(4)];
      const after = buildEventDots(withNew, false, width);
      const alone = bytes(buildEventDots([unrelated], false, width).color);
      const changed = changedTexels(bytes(before.color), bytes(after.color));
      expect(changed.length).toBeGreaterThan(0);
      // exactly the new story's own dots changed, nothing else
      for (const t of changed) expect(alone[t * 4 + 3]).toBeGreaterThan(0);
      for (const t of changedTexels(bytes(before.pulse), bytes(after.pulse))) expect(alone[t * 4 + 3]).toBeGreaterThan(0);

      // and removing one of the loners touches only that loner's dots
      const withoutTokyo = buildEventDots(base.filter((e) => e.id !== 'tokyo'), false, width);
      const tokyo = bytes(buildEventDots([loners[0]], false, width).color);
      const removed = changedTexels(bytes(before.color), bytes(withoutTokyo.color));
      expect(removed.length).toBeGreaterThan(0);
      for (const t of removed) expect(tokyo[t * 4 + 3]).toBeGreaterThan(0);
    });
  }

  it('does not depend on the order of the events array', () => {
    const shuffled = [...base].reverse();
    shuffled.push(shuffled.shift()!);
    for (const width of [DOT_LEVELS[0], DOT_LEVELS[3]]) {
      const a = buildEventDots(base, true, width);
      const b = buildEventDots(shuffled, true, width);
      expect(firstDifference(bytes(a.color), bytes(b.color))).toBe(-1);
      expect(firstDifference(bytes(a.pulse), bytes(b.pulse))).toBe(-1);
    }
  });

  it('gives a story the same pulse phase wherever it sits', () => {
    const at = (events: NewsEvent[]) => {
      const pulse = bytes(buildEventDots(events, false).pulse);
      const color = bytes(buildEventDots([loners[0]], false).color);
      for (let i = 0; i < color.length; i += 4) if (color[i + 3] > 0) return pulse[i + 1];
      return -1;
    };
    const phase = at([loners[0]]);
    expect(phase).toBe(pulsePhaseByte('tokyo'));
    expect(at([...cluster, loners[0]])).toBe(phase);
  });

  it('flags arrivals in the pulse texture blue channel only', () => {
    const plain = buildEventDots(base, false);
    const flagged = buildEventDots(base, false, DOT_GRID.width, { arrivals: new Set(['tokyo']) });
    const tokyo = bytes(buildEventDots([loners[0]], false).color);
    expect(firstDifference(bytes(plain.color), bytes(flagged.color))).toBe(-1);
    const p0 = bytes(plain.pulse);
    const p1 = bytes(flagged.pulse);
    let flaggedDots = 0;
    let wrong = 0;
    for (let i = 0; i < p0.length; i += 4) {
      if (p1[i] !== p0[i] || p1[i + 1] !== p0[i + 1] || p1[i + 3] !== p0[i + 3] || p0[i + 2] !== 0) wrong++;
      if (p1[i + 2] === 255) {
        flaggedDots++;
        if (tokyo[i + 3] === 0) wrong++;
      } else if (p1[i + 2] !== 0) wrong++;
    }
    expect(wrong).toBe(0);
    expect(flaggedDots).toBeGreaterThan(0);
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

describe('dimmed stories', () => {
  it('draws dimmed stories fainter and leaves the default output unchanged', () => {
    const events = [story('a', {}), story('b', { lat: -20, lon: 130, countryCode: 'AU' })];
    const plain = buildEventDots(events, false);
    const same = buildEventDots(events, false, DOT_GRID.width, { dimmed: new Set() });
    const dim = buildEventDots(events, false, DOT_GRID.width, { dimmed: new Set(['b']) });
    const a = bytes(plain.color);
    const s = bytes(same.color);
    let differing = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== s[i]) differing++;
    expect(differing).toBe(0);
    const d = bytes(dim.color);
    let lowered = 0;
    let unchanged = 0;
    for (let i = 3; i < a.length; i += 4) {
      if (a[i] === 0) {
        expect(d[i]).toBe(0);
        continue;
      }
      expect(d[i]).toBeGreaterThan(0);
      if (d[i] < a[i]) lowered++;
      else if (d[i] === a[i]) unchanged++;
    }
    expect(lowered).toBeGreaterThan(0);
    expect(unchanged).toBeGreaterThan(0);
  });
});
