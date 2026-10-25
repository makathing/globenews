import * as THREE from 'three';

export const GLOBE_RADIUS = 1;

/** Standard equirectangular mapping: lat/lon (degrees) → point on the globe. */
export function latLonToVec3(lat: number, lon: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Inverse of `latLonToVec3`: a point on (or off) the sphere → lat/lon in degrees. */
export function vec3ToLatLon(point: THREE.Vector3): { lat: number; lon: number } {
  const radius = point.length();
  const lat = 90 - Math.acos(Math.min(1, Math.max(-1, point.y / radius))) * (180 / Math.PI);
  let lon = Math.atan2(point.z, -point.x) * (180 / Math.PI) - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/** Great-circle distance between two lat/lon points, in degrees. */
export function angularDistance(latA: number, lonA: number, latB: number, lonB: number): number {
  const d = Math.PI / 180;
  const cos =
    Math.sin(latA * d) * Math.sin(latB * d) +
    Math.cos(latA * d) * Math.cos(latB * d) * Math.cos((lonA - lonB) * d);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / d;
}
