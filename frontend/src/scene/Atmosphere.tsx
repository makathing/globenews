import { useMemo } from 'react';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../lib/geo';

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    // classic back-side halo: back-face normals point away from the camera,
    // so (offset - dot) grows just outside the planet's silhouette
    float intensity = pow(0.6 - dot(vNormal, viewDir), 4.0);
    vec3 color = mix(vec3(0.08, 0.3, 0.85), vec3(0.35, 0.7, 1.0), clamp(intensity, 0.0, 1.0));
    gl_FragColor = vec4(color, clamp(intensity, 0.0, 1.0) * 0.55);
  }
`;

/** Outer atmosphere halo: a slightly larger back-facing shell with additive falloff. */
export function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );

  return (
    <mesh material={material}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.13, 64, 64]} />
    </mesh>
  );
}
