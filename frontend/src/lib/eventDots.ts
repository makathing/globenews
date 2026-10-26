import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { categoryPalette } from './categoryColors';

/** The halftone grid: dots per row and rows, pole to pole. */
export const DOT_GRID = { width: 420, height: 210 } as const;

/**
 * Dots per row at each zoom level, coarsest first (rows = width / 2). The
 * whole-globe view uses the first; zooming in crossfades to finer grids so a
 * dot keeps roughly the same size on screen.
 */
export const DOT_LEVELS = [420, 560, 720, 960] as const;

/** Angular radius, in degrees, of the patch of dots a story lights up. */
export function footprintDegrees(severity: number): number {
  return 0.5 + 0.22 * severity;
}

/**
 * A story's footprint on a grid `width` dots wide. The base grid keeps the
 * approved footprint exactly; finer grids never go below ~1.6 cells, so even a
 * small story lights its centre dot and the ring around it.
 */
export function footprintFor(severity: number, width: number = DOT_GRID.width): number {
  const base = footprintDegrees(severity);
  if (width <= DOT_GRID.width) return base;
  const cellDegrees = 180 / (width / 2);
  return Math.max(base, 1.6 * cellDegrees);
}

export interface EventDotTextures {
  /** rgb = category colour, a = how strongly that dot takes it (0 = untouched). */
  color: THREE.DataTexture;
  /** r = 1 when the story pulses (severity 4-5), g = its pulse phase. */
  pulse: THREE.DataTexture;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function dataTexture(
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
  colorSpace: THREE.ColorSpace,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  // one texel per dot, read at the dot's centre: no filtering, no wrap blur
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Most stories a single dot keeps as candidates; weaker ones beyond this drop out. */
const MAX_CANDIDATES = 3;

/**
 * A stable pseudo-random value in [0, 1) for a dot: an integer avalanche hash
 * of (row, col), so the same dot always makes the same choice across rebuilds.
 */
function dotHash(row: number, col: number): number {
  let h = Math.imul(row + 1, 0x27d4eb2d) ^ Math.imul(col + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * One texel per grid dot, written in the same equirectangular layout as the
 * sphere's UVs (row 0 is the south pole). Each story lights the dots within
 * its footprint, fading toward the edge. Where stories overlap, each dot
 * still shows one clean colour, but which story it takes is a stable dither:
 * the dot picks among (up to three) covering stories with probability
 * proportional to their weight there, so co-located stories all stay visible.
 * `width` picks the grid (one of DOT_LEVELS; rows = width / 2).
 */
export function buildEventDots(
  events: NewsEvent[],
  light: boolean,
  width: number = DOT_GRID.width,
): EventDotTextures {
  const W = width;
  const H = width / 2;
  const color = new Uint8Array(W * H * 4);
  const pulse = new Uint8Array(W * H * 4);
  const palette = categoryPalette(light);
  const deg = Math.PI / 180;

  // per-texel candidates: story index + 1 (0 = empty slot) and weight there
  const candidate = new Uint16Array(W * H * MAX_CANDIDATES);
  const candidateWeight = new Uint8Array(W * H * MAX_CANDIDATES);

  events.forEach((event, index) => {
    const radius = footprintFor(event.severity, W);
    const sinLat = Math.sin(event.lat * deg);
    const cosLat = Math.cos(event.lat * deg);
    const rowFrom = Math.max(0, Math.floor(((event.lat - radius + 90) / 180) * H));
    const rowTo = Math.min(H - 1, Math.ceil(((event.lat + radius + 90) / 180) * H));
    const lonSpan = radius / Math.max(0.15, cosLat);
    const colFrom = Math.floor(((event.lon - lonSpan + 180) / 360) * W);
    const colTo = Math.ceil(((event.lon + lonSpan + 180) / 360) * W);
    const id = index + 1;

    for (let row = rowFrom; row <= rowTo; row++) {
      const lat = (-90 + ((row + 0.5) * 180) / H) * deg;
      for (let c = colFrom; c <= colTo; c++) {
        const col = ((c % W) + W) % W;
        const lon = (-180 + ((col + 0.5) * 360) / W) * deg;
        const cos = sinLat * Math.sin(lat) + cosLat * Math.cos(lat) * Math.cos(lon - event.lon * deg);
        const distance = Math.acos(Math.min(1, cos)) / deg;
        if (distance > radius) continue;
        const weight = Math.max(1, Math.round((1 - distance / radius) * 255));
        // take an empty slot, else replace the weakest candidate if this is stronger
        const base = (row * W + col) * MAX_CANDIDATES;
        let slot = -1;
        for (let k = 0; k < MAX_CANDIDATES; k++) {
          if (candidate[base + k] === 0) { slot = k; break; }
          if (slot < 0 || candidateWeight[base + k] < candidateWeight[base + slot]) slot = k;
        }
        if (candidate[base + slot] !== 0 && weight <= candidateWeight[base + slot]) continue;
        candidate[base + slot] = id;
        candidateWeight[base + slot] = weight;
      }
    }
  });

  const rgb = events.map((event) => hexToRgb(palette[event.category]));
  for (let t = 0; t < W * H; t++) {
    const base = t * MAX_CANDIDATES;
    if (candidate[base] === 0) continue;
    let pick = base;
    if (candidate[base + 1] !== 0) {
      let total = 0;
      for (let k = 0; k < MAX_CANDIDATES && candidate[base + k] !== 0; k++) total += candidateWeight[base + k];
      let target = dotHash(Math.floor(t / W), t % W) * total;
      for (let k = 0; k < MAX_CANDIDATES && candidate[base + k] !== 0; k++) {
        pick = base + k;
        target -= candidateWeight[pick];
        if (target < 0) break;
      }
    }
    const index = candidate[pick] - 1;
    const event = events[index];
    const [r, g, b] = rgb[index];
    const i = t * 4;
    color[i] = r;
    color[i + 1] = g;
    color[i + 2] = b;
    color[i + 3] = candidateWeight[pick];
    pulse[i] = event.severity >= 4 ? 255 : 0;
    pulse[i + 1] = Math.round(((index * 1.7) % (Math.PI * 2)) / (Math.PI * 2) * 255);
  }

  // the palette is sRGB hex; the pulse channels are plain numbers
  return {
    color: dataTexture(color, W, H, THREE.SRGBColorSpace),
    pulse: dataTexture(pulse, W, H, THREE.NoColorSpace),
  };
}

/**
 * Smallest on-screen size, in CSS pixels, a grid cell may have before the
 * globe steps to a coarser grid. Calibrated so the default framings (desktop
 * at distance 4.3: ~3.9 px cells at 420; phone at 5.59: ~2.8 px) stay on the
 * approved 420 grid, and finer grids arrive only once zooming has made room
 * for them. With a device pixel ratio >= 1 this keeps every cell well above
 * 2.5 device pixels, crossfades included.
 */
export const MIN_CELL_CSS_PX = 3.4;

/** How far (in levels) zoom must fall back below a grid before leaving it. */
const LEVEL_HYSTERESIS = 0.15;

/**
 * The continuous dot level for a globe drawn `radiusPx` CSS pixels in radius:
 * 0 = DOT_LEVELS[0], 3 = DOT_LEVELS[3], fractions are log-spaced in between.
 * An integer part i means grid i is the finest whose cells are at least
 * MIN_CELL_CSS_PX on screen (near the middle of the disc); never below 0.
 */
export function continuousDotLevel(radiusPx: number): number {
  // the grid width whose cells would be exactly MIN_CELL_CSS_PX tall
  const ideal = (2 * Math.PI * radiusPx) / MIN_CELL_CSS_PX;
  const last = DOT_LEVELS.length - 1;
  if (ideal <= DOT_LEVELS[0]) return 0;
  if (ideal >= DOT_LEVELS[last]) return last;
  let i = 0;
  while (ideal >= DOT_LEVELS[i + 1]) i++;
  return i + Math.log(ideal / DOT_LEVELS[i]) / Math.log(DOT_LEVELS[i + 1] / DOT_LEVELS[i]);
}

/**
 * The grid to draw (an index into DOT_LEVELS) for a continuous level, given
 * the one drawn now. Steps up as soon as the finer grid's cells are big
 * enough; steps down only once the level is LEVEL_HYSTERESIS below the
 * current grid, so a zoom resting near a boundary never flickers between two.
 */
export function pickDotLevel(level: number, current: number): number {
  const last = DOT_LEVELS.length - 1;
  const up = Math.min(Math.floor(level), last);
  if (up > current) return up;
  if (level < current - LEVEL_HYSTERESIS) return Math.max(0, Math.min(Math.floor(level + LEVEL_HYSTERESIS), last));
  return current;
}
