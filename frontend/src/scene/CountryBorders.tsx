import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { latLonToVec3, GLOBE_RADIUS } from '../lib/geo';

type Ring = [number, number][];

interface GeoFeature {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] };
}

function ringsOf(feature: GeoFeature): Ring[] {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') return coordinates as Ring[];
  if (type === 'MultiPolygon') return (coordinates as Ring[][]).flat();
  return [];
}

/**
 * Natural Earth 110m borders drawn as one additive LineSegments batch,
 * floating just above the surface — the holo-map layer of the game look.
 */
export function CountryBorders() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}geo/countries-110m.geojson`)
      .then((res) => res.json())
      .then((geojson: { features: GeoFeature[] }) => {
        if (cancelled) return;
        const positions: number[] = [];
        const radius = GLOBE_RADIUS * 1.004;
        for (const feature of geojson.features) {
          for (const ring of ringsOf(feature)) {
            for (let i = 0; i < ring.length - 1; i++) {
              const a = latLonToVec3(ring[i][1], ring[i][0], radius);
              const b = latLonToVec3(ring[i + 1][1], ring[i + 1][0], radius);
              positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
            }
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        setGeometry(geo);
      })
      .catch((error) => console.error('country borders failed to load', error));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color="#3de8ff"
        transparent
        opacity={0.34}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}
