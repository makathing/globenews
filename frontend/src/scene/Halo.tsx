import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../lib/geo';
import { useTheme } from '../store';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uAdditive;
  uniform float uExtent;
  varying vec2 vUv;
  void main() {
    // distance from the centre in globe radii
    float r = length(vUv - 0.5) * 2.0 * uExtent;
    float a = smoothstep(0.95, 1.0, r) * pow(smoothstep(1.18, 1.0, r), 1.6) * uAlpha;
    // additive wants premultiplied colour; normal blending wants straight alpha
    gl_FragColor = vec4(uColor * mix(1.0, a, uAdditive), a);
  }
`;

/** Half-width of the billboard, in globe radii. Just past the halo's outer edge. */
const HALO_EXTENT = 1.2;

const noRaycast = () => null;

/**
 * Flat-mode backdrop: a soft ring of the theme's rim colour just outside the
 * planet, as in the original mockups. A camera-facing quad through the
 * globe's centre, so the earth's front face hides everything inside the
 * silhouette and only the outer falloff shows.
 */
export function Halo() {
  const theme = useTheme();
  const meshRef = useRef<THREE.Mesh | null>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uAlpha: { value: 0 },
          uAdditive: { value: 1 },
          uExtent: { value: HALO_EXTENT },
        },
      }),
    [],
  );

  useEffect(() => {
    (material.uniforms.uColor.value as THREE.Color).set(theme.rim);
    material.uniforms.uAlpha.value = theme.light ? 0.13 : 0.2;
    material.uniforms.uAdditive.value = theme.light ? 0 : 1;
    // a glow adds light on a dark page; on a light one adding only washes it out
    material.blending = theme.light ? THREE.NormalBlending : THREE.AdditiveBlending;
    material.needsUpdate = true;
  }, [material, theme]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.quaternion.copy(camera.quaternion);
    // Seen in perspective, the silhouette is wider than the radius on a plane
    // through the centre (d / sqrt(d² - R²)); scale so r = 1 sits on the limb.
    const d = camera.position.length();
    const limb = d > GLOBE_RADIUS * 1.01 ? d / Math.sqrt(d * d - GLOBE_RADIUS * GLOBE_RADIUS) : 1;
    mesh.scale.setScalar(limb);
  });

  return (
    <mesh ref={meshRef} material={material} raycast={noRaycast} renderOrder={-1}>
      <planeGeometry args={[GLOBE_RADIUS * HALO_EXTENT * 2, GLOBE_RADIUS * HALO_EXTENT * 2]} />
    </mesh>
  );
}
