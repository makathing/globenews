import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CATEGORIES, type Category } from '../../../shared/news';
import { SCULPTURE_HEIGHT } from './sculptures';

/**
 * One low-poly silhouette per category, built from three's primitives and
 * merged into a single flat-shaded geometry. Every shape stands on y = 0 with
 * +Y up, is a closed solid (front faces only), and keeps its footprint inside
 * about four units so neighbours don't interpenetrate. Nothing here moves.
 *
 * Units: `u` is a tenth of the severity-3 reference height, so a shape that
 * reaches 10u is exactly SCULPTURE_HEIGHT tall. Recognisability at ~20px comes
 * from the envelope, not the detail: spiky, dome-and-shard, wide-with-roof,
 * staircase, cross, tilted disc on a stick, Y on a stick, three lumps.
 */

const u = SCULPTURE_HEIGHT / 10;

interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** Rotate about the origin, then translate — in that order, like posing a prop. */
function at(geometry: THREE.BufferGeometry, p: Place): THREE.BufferGeometry {
  if (p.rx) geometry.rotateX(p.rx);
  if (p.rz) geometry.rotateZ(p.rz);
  if (p.ry) geometry.rotateY(p.ry);
  geometry.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  return geometry;
}

const cyl = (rTop: number, rBottom: number, h: number, segs: number, p: Place) =>
  at(new THREE.CylinderGeometry(rTop * u, rBottom * u, h * u, segs), scaled(p));
const cone = (r: number, h: number, segs: number, p: Place) =>
  at(new THREE.ConeGeometry(r * u, h * u, segs), scaled(p));
const box = (w: number, h: number, d: number, p: Place) =>
  at(new THREE.BoxGeometry(w * u, h * u, d * u), scaled(p));
const sphere = (r: number, ws: number, hs: number, p: Place) =>
  at(new THREE.SphereGeometry(r * u, ws, hs), scaled(p));
const tetra = (r: number, p: Place) => at(new THREE.TetrahedronGeometry(r * u), scaled(p));

/** Positions in the recipes are in `u`; rotations are radians. */
function scaled(p: Place): Place {
  return { ...p, x: (p.x ?? 0) * u, y: (p.y ?? 0) * u, z: (p.z ?? 0) * u };
}

/**
 * Merge, then un-index and recompute normals so every face is its own flat
 * facet — the look the ship and satellites have. Polyhedra come non-indexed
 * from three while the rest are indexed, so everything is un-indexed first.
 */
function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    n.deleteAttribute('uv');
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('sculpture parts did not merge');
  flat.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

const RECIPES: Record<Category, () => THREE.BufferGeometry> = {
  // a cluster of spikes: one tall, three leaning out from the plinth
  conflict: () =>
    finish([
      cyl(2.4, 2.8, 1, 6, { y: 0.5 }),
      cone(1, 9, 5, { y: 1 + 4.5 }),
      ...[0, 1, 2].map((i) => {
        const g = new THREE.ConeGeometry(0.8 * u, 6.5 * u, 4);
        g.translate(0, 3.25 * u, 0); // base on the origin
        g.rotateZ(-0.5); // lean toward +x
        g.translate(1.4 * u, 1 * u, 0); // out to the plinth's edge
        g.rotateY((i * 2 * Math.PI) / 3);
        return g;
      }),
    ]),
  // a dome split open, shards leaning out of the crack
  disaster: () =>
    finish([
      new THREE.SphereGeometry(2.8 * u, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      cyl(2.8, 2.8, 0.3, 8, { y: 0.15 }),
      tetra(2.4, { rz: 0.45, ry: 0.6, x: 0.5, y: 5.6 }),
      tetra(1.5, { rz: -0.6, x: -1.8, y: 3.4, z: 0.8 }),
    ]),
  // a rotunda: ring of pillars under a shallow roof
  politics: () =>
    finish([
      cyl(3.2, 3.4, 1, 8, { y: 0.5 }),
      ...[0, 1, 2, 3, 4, 5].map((i) =>
        cyl(0.4, 0.4, 5, 4, {
          x: Math.cos((i * Math.PI) / 3) * 2.4,
          z: Math.sin((i * Math.PI) / 3) * 2.4,
          y: 1 + 2.5,
        }),
      ),
      cyl(3.3, 3.3, 0.8, 8, { y: 6.4 }),
      cone(3.2, 3, 8, { y: 6.8 + 1.5 }),
    ]),
  // a bar chart climbing to the right
  economy: () =>
    finish([
      box(8.6, 0.5, 2.8, { y: 0.25 }),
      ...[3, 5, 7, 10].map((h, i) => box(1.6, h, 1.8, { x: -3 + i * 2, y: 0.5 + h / 2 })),
    ]),
  // a cross on a plinth
  health: () =>
    finish([
      cyl(2.2, 2.6, 1.2, 8, { y: 0.6 }),
      box(1.7, 8.8, 1.7, { y: 1.2 + 4.4 }),
      box(5.6, 1.7, 1.7, { y: 7.2 }),
    ]),
  // a dish on a mast, tilted toward the sky
  science: () =>
    finish([
      cyl(1.4, 1.9, 0.8, 6, { y: 0.4 }),
      cyl(0.4, 0.6, 6.2, 5, { y: 0.8 + 3.1 }),
      cyl(3, 1.2, 1.4, 10, { rz: -0.6, x: 0.9, y: 7.4 }),
      (() => {
        const g = new THREE.ConeGeometry(0.3 * u, 1.8 * u, 4);
        g.translate(0, 1.6 * u, 0); // out along the dish axis
        g.rotateZ(-0.6);
        g.translate(0.9 * u, 7.4 * u, 0);
        return g;
      })(),
    ]),
  // a turbine: three static blades in a Y on a slender mast
  climate: () =>
    finish([
      cyl(0.35, 0.65, 6.8, 5, { y: 3.4 }),
      box(1.1, 1.1, 1.4, { y: 6.8, z: 0.6 }),
      ...[0, 1, 2].map((i) => {
        const g = new THREE.ConeGeometry(0.65 * u, 4.2 * u, 3);
        g.translate(0, (2.1 + 0.5) * u, 0); // root at the hub
        g.rotateZ((i * 2 * Math.PI) / 3);
        g.translate(0, 6.8 * u, 1.3 * u);
        return g;
      }),
    ]),
  // three figures on a step, the middle one taller
  society: () =>
    finish([
      cyl(3.4, 3.6, 0.6, 8, { y: 0.3 }),
      ...figure(5.6, 1, { x: 0, z: -0.6 }),
      ...figure(5.6, 0.85, { x: 2.3, z: 0.9 }),
      ...figure(5.6, 0.85, { x: -2.3, z: 0.9 }),
    ]),
};

/** A body and a head, standing on the plinth's top at y = 0.6u. */
function figure(body: number, scale: number, p: Place): THREE.BufferGeometry[] {
  const parts = [
    cyl(0.8, 1.1, body, 5, { y: body / 2 }),
    sphere(0.95, 6, 4, { y: body + 0.9 }),
  ];
  for (const g of parts) {
    g.scale(scale, scale, scale);
    g.translate((p.x ?? 0) * u, 0.6 * u, (p.z ?? 0) * u);
  }
  return parts;
}

const cache: Partial<Record<Category, THREE.BufferGeometry>> = {};

/**
 * The shared base geometry for a category — built once per page and never
 * disposed. Mounts attach their instance attributes to a clone, so disposing a
 * mount can't take a buffer another mount is drawing with.
 */
export function getSculptureGeometry(category: Category): THREE.BufferGeometry {
  return (cache[category] ??= RECIPES[category]());
}

/** For the dev console: triangles per silhouette. */
export function sculptureTriangleCounts(): Record<Category, number> {
  return Object.fromEntries(
    CATEGORIES.map((c) => [c, getSculptureGeometry(c).attributes.position.count / 3]),
  ) as Record<Category, number>;
}
