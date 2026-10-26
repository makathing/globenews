import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { categoryPalette } from './categoryColors';

/** The halftone grid: dots per row and rows, pole to pole. */
export const DOT_GRID = { width: 420, height: 210 } as const;

/** Angular radius, in degrees, of the patch of dots a story lights up. */
export function footprintDegrees(severity: number): number {
  return 0.5 + 0.22 * severity;
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

function dataTexture(data: Uint8Array<ArrayBuffer>, colorSpace: THREE.ColorSpace): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, DOT_GRID.width, DOT_GRID.height, THREE.RGBAFormat);
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
 */
export function buildEventDots(events: NewsEvent[], light: boolean): EventDotTextures {
  const { width: W, height: H } = DOT_GRID;
  const color = new Uint8Array(W * H * 4);
  const pulse = new Uint8Array(W * H * 4);
  const palette = categoryPalette(light);
  const deg = Math.PI / 180;

  // per-texel candidates: story index + 1 (0 = empty slot) and weight there
  const candidate = new Uint16Array(W * H * MAX_CANDIDATES);
  const candidateWeight = new Uint8Array(W * H * MAX_CANDIDATES);

  events.forEach((event, index) => {
    const radius = footprintDegrees(event.severity);
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
    color: dataTexture(color, THREE.SRGBColorSpace),
    pulse: dataTexture(pulse, THREE.NoColorSpace),
  };
}
