import { useMemo } from 'react';
import * as THREE from 'three';
import { SUN_DIRECTION } from './Earth';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vDir;

  // cheap value noise for a whisper of nebula structure
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1, 0, 0));
    float n010 = hash(i + vec3(0, 1, 0));
    float n110 = hash(i + vec3(1, 1, 0));
    float n001 = hash(i + vec3(0, 0, 1));
    float n101 = hash(i + vec3(1, 0, 1));
    float n011 = hash(i + vec3(0, 1, 1));
    float n111 = hash(i + vec3(1, 1, 1));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 base = vec3(0.012, 0.02, 0.038);

    // directional lift toward the sun — the sky carries the light
    float sunward = pow(max(dot(vDir, uSunDir), 0.0), 2.2);
    vec3 sunTint = vec3(0.10, 0.085, 0.07) * sunward;

    // very faint large-scale nebula variation, slightly blue
    float neb = noise(vDir * 3.0) * 0.5 + noise(vDir * 7.0) * 0.5;
    vec3 nebula = vec3(0.015, 0.025, 0.05) * smoothstep(0.45, 0.85, neb);

    gl_FragColor = vec4(base + sunTint + nebula, 1.0);
  }
`;

/** Replaces the flat background: a huge inward-facing sphere whose sky subtly brightens toward the sun. */
export function SpaceBackground() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uSunDir: { value: SUN_DIRECTION.clone() } },
      }),
    [],
  );

  return (
    <mesh material={material} renderOrder={-10}>
      <sphereGeometry args={[80, 32, 32]} />
    </mesh>
  );
}
