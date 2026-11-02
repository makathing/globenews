// Generates frontend/src/ui/regionShapes.ts: one small SVG outline per
// region view, drawn from real geography (Natural Earth 110m countries in
// public/geo/countries-110m.geojson) rather than by hand. Run it when the
// region map in src/lib/regions.ts or the geojson changes:
//
//   node scripts/region-icons.mjs
//
// Each region is the filled union of its member countries (overlapping fills
// read as one shape, so no polygon union is needed), clipped to a frame that
// keeps the icon recognisable (Europe leaves out Russia and Greenland), with islands too small to see at 24px dropped and
// every ring simplified (Douglas–Peucker) to a fraction of a pixel.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const geo = JSON.parse(readFileSync(resolve(root, 'public/geo/countries-110m.geojson'), 'utf8'));
const regionsSrc = readFileSync(resolve(root, 'src/lib/regions.ts'), 'utf8');

/** The member lists, read from regions.ts so there is one source of truth. */
function memberList(name) {
  const m = regionsSrc.match(new RegExp(`const ${name} =\\s*'([A-Z ]+)'`));
  if (!m) throw new Error(`regions.ts: ${name} not found`);
  return new Set(m[1].split(' '));
}
const US_CODES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP']);
if (!/US: 'us'/.test(regionsSrc)) throw new Error("regions.ts: the US mapping moved; update US_CODES");

/**
 * Per region: which countries, the lon/lat frame they are clipped to, the
 * smallest polygon kept (in square icon units), and optionally countries
 * drawn faintly for context (the Americas icon shows the US it surrounds).
 */
const REGIONS = {
  us: { members: new Set(['US']), clip: [-125, 24, -66.5, 49.5], minArea: 1.5 },
  // Russia would stretch Europe to the Pacific: it is left out of the icon
  europe: { members: memberList('EUROPE'), clip: [-25, 34, 50, 71.5], minArea: 0.25, exclude: new Set(['GL', 'RU']) },
  asia: { members: memberList('ASIA'), clip: [25, -48, 180, 56], minArea: 0.12 },
  'africa-me': { members: memberList('AFRICA_ME'), clip: [-26, -36, 64, 42], minArea: 0.12 },
  americas: {
    members: memberList('AMERICAS'),
    context: new Set(['US']),
    clip: [-141, -56, -34, 72],
    minArea: 0.2,
  },
};

const SIZE = 24;
const PAD = 1;
const TOLERANCE = 0.3; // icon units (≈px at 24px)

/** Sutherland–Hodgman: a ring clipped to an axis-aligned lon/lat box. */
function clipRing(ring, [x0, y0, x1, y1]) {
  const edges = [
    (p) => p[0] >= x0,
    (p) => p[0] <= x1,
    (p) => p[1] >= y0,
    (p) => p[1] <= y1,
  ];
  const cut = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  let out = ring;
  for (let e = 0; e < 4 && out.length; e++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const inCur = edges[e](cur);
      const inPrev = edges[e](prev);
      if (inCur) {
        if (!inPrev) out.push(cut[e](prev, cur));
        out.push(cur);
      } else if (inPrev) out.push(cut[e](prev, cur));
    }
  }
  return out;
}

function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function simplify(points, tol) {
  if (points.length < 4) return points;
  const sqTol = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0;
    let index = -1;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (maxD > sqTol && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function polygonsOf(codes, exclude) {
  const polys = [];
  for (const f of geo.features) {
    const iso = f.properties.iso;
    if (!codes.has(iso) || exclude?.has(iso)) continue;
    const g = f.geometry;
    const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of list) polys.push(poly[0]); // outer rings only: lakes don't show at 24px
  }
  return polys;
}

function build(id, spec) {
  const midLat = (spec.clip[1] + spec.clip[3]) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const project = ([lon, lat]) => [lon * kx, -lat];
  const clipRings = (rings) =>
    rings.map((r) => clipRing(r, spec.clip)).filter((r) => r.length >= 3).map((r) => r.map(project));
  const main = clipRings(polygonsOf(spec.members, spec.exclude));
  const context = spec.context ? clipRings(polygonsOf(spec.context)) : [];
  // fit the members (and context) into the 24-unit box, centred
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of [...main, ...context]) for (const [x, y] of r) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const scale = (SIZE - 2 * PAD) / Math.max(x1 - x0, y1 - y0);
  const ox = (SIZE - (x1 - x0) * scale) / 2;
  const oy = (SIZE - (y1 - y0) * scale) / 2;
  const toIcon = (r) => r.map(([x, y]) => [ox + (x - x0) * scale, oy + (y - y0) * scale]);
  const path = (rings) =>
    rings
      .map(toIcon)
      .filter((r) => area(r) >= spec.minArea)
      .map((r) => simplify([...r, r[0]], TOLERANCE).slice(0, -1))
      .filter((r) => r.length >= 3)
      .map((r) => 'M' + r.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z')
      .join('');
  const d = path(main);
  if (!d) throw new Error(`${id}: empty outline`);
  return { d, context: context.length ? path(context) : undefined };
}

const shapes = Object.fromEntries(Object.entries(REGIONS).map(([id, spec]) => [id, build(id, spec)]));

const body = Object.entries(shapes)
  .map(([id, s]) => {
    const lines = [`  ${JSON.stringify(id)}: {`, `    d: ${JSON.stringify(s.d)},`];
    if (s.context) lines.push(`    context: ${JSON.stringify(s.context)},`);
    lines.push('  },');
    return lines.join('\n');
  })
  .join('\n');

const out = `// Generated by scripts/region-icons.mjs from public/geo/countries-110m.geojson
// (Natural Earth 110m) and the region map in src/lib/regions.ts. Do not edit.
import type { RegionId } from '../lib/regions';

export interface RegionShape {
  /** The region's countries, filled, in a 0 0 ${SIZE} ${SIZE} box. */
  d: string;
  /** Neighbours drawn faintly for context (the US inside the Americas). */
  context?: string;
}

export const REGION_SHAPE_VIEWBOX = '0 0 ${SIZE} ${SIZE}';

export const REGION_SHAPES: Record<Exclude<RegionId, 'world'>, RegionShape> = {
${body}
};
`;
writeFileSync(resolve(root, 'src/ui/regionShapes.ts'), out);
for (const [id, s] of Object.entries(shapes)) console.log(id, s.d.length, 'chars', s.context ? `(+${s.context.length} context)` : '');
