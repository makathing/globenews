import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cameraMotion, prefersReducedMotion, useTheme } from '../store';

const STAR_COUNT = prefersReducedMotion ? 2500 : 7000;

/**
 * How much a star elongates at a given camera speed. The deadzone matters:
 * damping, a nudge, or any slow drift should leave the sky perfectly still —
 * only a deliberate drag earns streaks. Shared by both stages so the sprite
 * can never grow without the fragment drawing a streak inside it.
 */
const streakAmount = /* glsl */ `
  float streakAmount(float speed) {
    return min(max(speed - 0.06, 0.0) * 7.0, 2.2);
  }
`;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uSpeed;
  varying float vTwinkle;
  varying float vSize;
  ${streakAmount}
  void main() {
    vTwinkle = 0.72 + 0.28 * sin(uTime * (0.6 + aPhase * 2.2) + aPhase * 40.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // stars grow slightly while the camera is moving so streaks have room
    float stretch = 1.0 + streakAmount(uSpeed) * 0.75;
    vSize = aSize;
    gl_PointSize = aSize * stretch * (240.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uVelocity;   // smoothed screen-space camera velocity
  uniform float uSpeed;
  uniform float uBrightness;
  varying float vTwinkle;
  varying float vSize;
  ${streakAmount}
  void main() {
    vec2 p = gl_PointCoord - 0.5;

    float streak = streakAmount(uSpeed);
    vec2 dir = streak > 0.0 ? normalize(uVelocity) : vec2(1.0, 0.0);

    // distance to a line segment through the sprite center along the motion
    // direction: still = round star, moving = elongated streak
    float halfLen = 0.5 * (streak / (1.0 + streak)) * 0.85;
    float along = clamp(dot(p, dir), -halfLen, halfLen);
    float dist = length(p - dir * along);

    float core = smoothstep(0.09, 0.0, dist);
    float glow = smoothstep(0.22, 0.0, dist) * 0.35;
    float alpha = (core + glow) * vTwinkle;

    // fade the streak toward its ends
    alpha *= 1.0 - smoothstep(0.35, 0.5, abs(along) / max(halfLen, 0.001)) * 0.4;

    alpha *= uBrightness;
    if (alpha < 0.01) discard;
    vec3 color = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.98, 0.9), fract(vSize * 13.7));
    gl_FragColor = vec4(color, alpha);
  }
`;

export function Starfield() {
  const theme = useTheme();
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    const rng = () => Math.random();
    for (let i = 0; i < STAR_COUNT; i++) {
      // uniform on a big sphere around the scene
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const r = 42 + rng() * 14;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      sizes[i] = 0.6 + Math.pow(rng(), 2.6) * 2.6;
      phases[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uVelocity: { value: new THREE.Vector2(1, 0) },
        uBrightness: { value: 1 },
      },
    });
    return { geometry: geo, material: mat };
  }, []);

  useFrame((state) => {
    const uniforms = materialRef.current?.uniforms;
    if (!uniforms) return;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uSpeed.value = prefersReducedMotion ? 0 : cameraMotion.speed;
    uniforms.uBrightness.value = theme.starBrightness;
    (uniforms.uVelocity.value as THREE.Vector2).set(cameraMotion.vx, cameraMotion.vy);
  });

  return <points geometry={geometry} material={material} ref={(p) => {
    if (p) materialRef.current = p.material as THREE.ShaderMaterial;
  }} />;
}
