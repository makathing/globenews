import * as THREE from 'three';
import type { Category, NewsEvent } from '../../../shared/news';

/**
 * Paints an equirectangular tint texture: every country carrying events is
 * filled with its dominant category colour. Equirectangular maps lon/lat
 * straight onto canvas x/y, so this needs no triangulation — we draw the same
 * GeoJSON the borders layer already uses.
 */

type Ring = [number, number][];
interface CountryFeature {
  properties: { name: string; iso: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] };
}

const WIDTH = 2048;
const HEIGHT = 1024;

function polygonsOf(feature: CountryFeature): Ring[] {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') return coordinates as Ring[];
  if (type === 'MultiPolygon') return (coordinates as Ring[][]).flat();
  return [];
}

/** Ray-casting point-in-ring test in raw lon/lat space. */
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Resolve an event to a country: trust an explicit ISO code when it matches a
 * polygon, otherwise fall back to point-in-polygon on the coordinates. The
 * fallback matters — synthesizers frequently emit "XX" for multi-country
 * stories, and coordinates are the more reliable signal anyway.
 */
export function resolveCountry(
  event: NewsEvent,
  features: CountryFeature[],
  byIso: Map<string, CountryFeature>,
): CountryFeature | undefined {
  if (event.countryCode && event.countryCode !== 'XX') {
    const direct = byIso.get(event.countryCode);
    if (direct) return direct;
  }
  for (const feature of features) {
    for (const ring of polygonsOf(feature)) {
      if (pointInRing(event.lon, event.lat, ring)) return feature;
    }
  }
  return undefined;
}

function project(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * WIDTH, ((90 - lat) / 180) * HEIGHT];
}

function tracePolygon(ctx: CanvasRenderingContext2D, ring: Ring, shiftX: number): void {
  ctx.beginPath();
  ring.forEach(([lon, lat], index) => {
    const [x, y] = project(lon, lat);
    if (index === 0) ctx.moveTo(x + shiftX, y);
    else ctx.lineTo(x + shiftX, y);
  });
  ctx.closePath();
}

export interface TintResult {
  texture: THREE.CanvasTexture;
  /** Countries actually tinted, for diagnostics. */
  tinted: string[];
  /** Events that could not be placed in any country. */
  unresolved: number;
}

export function buildCountryTint(events: NewsEvent[], geojson: { features: CountryFeature[] }): TintResult {
  const features = geojson.features;
  const byIso = new Map<string, CountryFeature>();
  for (const feature of features) {
    if (feature.properties.iso) byIso.set(feature.properties.iso, feature);
  }

  // dominant category per country (ties broken by highest severity seen)
  const perCountry = new Map<string, { feature: CountryFeature; weights: Map<Category, number> }>();
  let unresolved = 0;
  for (const event of events) {
    const feature = resolveCountry(event, features, byIso);
    if (!feature) {
      unresolved += 1;
      continue;
    }
    const key = feature.properties.iso || feature.properties.name;
    const entry = perCountry.get(key) ?? { feature, weights: new Map<Category, number>() };
    entry.weights.set(event.category, (entry.weights.get(event.category) ?? 0) + event.severity);
    perCountry.set(key, entry);
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const tinted: string[] = [];
  for (const [key, { feature, weights }] of perCountry) {
    let dominant: Category = 'politics';
    let best = -1;
    for (const [category, weight] of weights) {
      if (weight > best) {
        best = weight;
        dominant = category;
      }
    }
    // Neutral wash: the beams already carry category colour, so tinting by
    // category too just doubles the palette. Intensity encodes how much is
    // happening there instead.
    const weight = [...weights.values()].reduce((sum, w) => sum + w, 0);
    const strength = Math.min(1, 0.35 + weight / 14);
    const color = '#cfe0f5';
    tinted.push(`${key}:${dominant}`);

    for (const ring of polygonsOf(feature)) {
      // draw three copies so polygons crossing the antimeridian still close
      for (const shift of [-WIDTH, 0, WIDTH]) {
        tracePolygon(ctx, ring, shift);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.30 * strength;
        ctx.fill();
        ctx.globalAlpha = 0.5 * strength;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, tinted, unresolved };
}
