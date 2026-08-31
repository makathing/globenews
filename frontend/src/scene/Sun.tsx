import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SUN_DIRECTION } from './Earth';
import { useTheme } from '../store';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p);

    // hot core → warm-white falloff (tight: a distant star, not a floodlight)
    float core = smoothstep(0.075, 0.0, r);
    float halo = pow(smoothstep(0.5, 0.0, r), 3.4) * 0.3;
    // faint horizontal flare streak
    float flare = smoothstep(0.01, 0.0, abs(p.y)) * smoothstep(0.42, 0.05, r) * 0.22;
    // slow breathing so it feels alive
    float breathe = 0.95 + 0.05 * sin(uTime * 0.6);

    float a = (core + halo + flare) * uIntensity * breathe;
    vec3 color = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.98, 0.92), core);
    gl_FragColor = vec4(color * a, a);
  }
`;

/** Visible sun: additive camera-facing glow sitting at SUN_DIRECTION inside the starfield. */
export function Sun() {
  const theme = useTheme();
  const meshRef = useRef<THREE.Mesh | null>(null);

  const { position, material } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uIntensity: { value: 1 },
        uTime: { value: 0 },
      },
    });
    return { position: SUN_DIRECTION.clone().multiplyScalar(46), material: mat };
  }, []);

  useEffect(() => {
    material.uniforms.uIntensity.value = theme.sunIntensity;
  }, [material, theme]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    meshRef.current?.quaternion.copy(state.camera.quaternion);
  });

  if (theme.sunIntensity <= 0) return null;

  return (
    <mesh ref={meshRef} position={position} material={material}>
      <planeGeometry args={[16, 16]} />
    </mesh>
  );
}
