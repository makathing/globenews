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

/**
 * One texel per grid dot, written in the same equirectangular layout as the
 * sphere's UVs (row 0 is the south pole). Each story lights the dots within
 * its footprint, fading toward the edge; where two stories overlap, the
 * stronger one owns the dot, so a dot always shows one clean colour.
 */
export function buildEventDots(events: NewsEvent[], light: boolean): EventDotTextures {
  const { width: W, height: H } = DOT_GRID;
  const color = new Uint8Array(W * H * 4);
  const pulse = new Uint8Array(W * H * 4);
  const palette = categoryPalette(light);
  const deg = Math.PI / 180;

  events.forEach((event, index) => {
    const radius = footprintDegrees(event.severity);
    const [r, g, b] = hexToRgb(palette[event.category]);
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
        color[i] = r;
        color[i + 1] = g;
        color[i + 2] = b;
        color[i + 3] = weight;
        pulse[i] = event.severity >= 4 ? 255 : 0;
        pulse[i + 1] = phase;
      }
    }
  });

  // the palette is sRGB hex; the pulse channels are plain numbers
  return {
    color: dataTexture(color, THREE.SRGBColorSpace),
    pulse: dataTexture(pulse, THREE.NoColorSpace),
  };
}
