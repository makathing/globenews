import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../lib/geo';
import { DOT_GRID, buildEventDots } from '../lib/eventDots';
import { prefersReducedMotion, useTheme, useVisibleEvents } from '../store';
import { useEventPicking } from './eventPicking';

/** Fixed sun direction: keeps a soft terminator and a lit limb in view. */
export const SUN_DIRECTION = new THREE.Vector3(-2.2, 0.9, 1.6).normalize();

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/*
  The planet is a dot matrix: land as a grid of dots on a plain ocean. News is
  the same grid changing colour — the dots around a story take its category
  colour, strongest at the centre, and barely grow, so a busy region still
  reads as separate dots rather than a glowing disc.
*/
const fragmentShader = /* glsl */ `
  uniform sampler2D waterMap;
  uniform sampler2D eventColor;   // rgb category colour, a weight
  uniform sampler2D eventPulse;   // r pulses?, g phase
  uniform vec2 uGrid;
  uniform float uTime;
  uniform vec3 sunDir;
  uniform vec3 uOcean;
  uniform vec3 uLimb;
  uniform vec3 uDot;
  uniform vec3 uRim;
  uniform float uRimStrength;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float facing = max(dot(normal, viewDir), 0.0);
    // soft key light so the sphere keeps its volume
    float shade = 0.72 + 0.28 * clamp(dot(normal, sunDir) * 0.5 + 0.5, 0.0, 1.0);

    // ocean: brighter facing the viewer, deepening toward the limb
    vec3 color = mix(uLimb, uOcean, smoothstep(0.0, 0.9, facing));

    vec2 grid = vUv * uGrid;
    vec2 cellUv = (floor(grid) + 0.5) / uGrid;
    vec2 cell = fract(grid) - 0.5;

    // every dot reads its story at its own centre, so it shows one flat colour
    vec4 ev = texture2D(eventColor, cellUv);
    vec4 pl = texture2D(eventPulse, cellUv);
    float lit = step(0.002, ev.a);
    float pulse = 1.0 + pl.r * 0.12 * sin(uTime * 2.2 + pl.g * 6.2832);
    float strength = clamp((0.35 + 0.55 * ev.a) * pulse, 0.0, 1.0) * lit;

    float land = 1.0 - texture2D(waterMap, vUv).r;
    // shrink dots toward the coast so edges feather instead of clipping;
    // a story offshore lights its dots over the sea as well
    float density = max(smoothstep(0.25, 0.75, land), lit);
    // at most ~10% larger, so neighbours always keep their gap
    float radial = length(cell) / (1.0 + 0.1 * ev.a * lit);
    float dotMask = smoothstep(0.42, 0.16, radial) * density;

    vec3 dotColor = mix(uDot * shade, ev.rgb, strength);
    color = mix(color, dotColor, dotMask);

    // subtle inner rim, brightest on the sunlit limb
    float fresnel = pow(1.0 - facing, 3.0);
    float litSide = 0.2 + 0.8 * smoothstep(-0.35, 0.55, dot(normal, sunDir));
    color += fresnel * uRim * uRimStrength * litSide;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function Earth() {
  const theme = useTheme();
  const events = useVisibleEvents();
  const picking = useEventPicking(events);
  const waterMap = useTexture(`${import.meta.env.BASE_URL}textures/earth-water.png`);

  const material = useMemo(() => {
    waterMap.colorSpace = THREE.NoColorSpace;
    waterMap.anisotropy = 8;
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        waterMap: { value: waterMap },
        eventColor: { value: null },
        eventPulse: { value: null },
        uGrid: { value: new THREE.Vector2(DOT_GRID.width, DOT_GRID.height) },
        uTime: { value: 0 },
        sunDir: { value: SUN_DIRECTION.clone() },
        uOcean: { value: new THREE.Color() },
        uLimb: { value: new THREE.Color() },
        uDot: { value: new THREE.Color() },
        uRim: { value: new THREE.Color() },
        uRimStrength: { value: 0.16 },
      },
    });
  }, [waterMap]);

  const dots = useMemo(() => buildEventDots(events, theme.light), [events, theme.light]);

  useEffect(() => {
    material.uniforms.eventColor.value = dots.color;
    material.uniforms.eventPulse.value = dots.pulse;
    return () => {
      dots.color.dispose();
      dots.pulse.dispose();
    };
  }, [material, dots]);

  useEffect(() => {
    const u = material.uniforms;
    (u.uOcean.value as THREE.Color).set(theme.ocean);
    (u.uLimb.value as THREE.Color).set(theme.limb);
    (u.uDot.value as THREE.Color).set(theme.dot);
    (u.uRim.value as THREE.Color).set(theme.rim);
    u.uRimStrength.value = theme.light ? 0.1 : 0.16;
  }, [material, theme]);

  useFrame(({ clock }) => {
    if (!prefersReducedMotion) material.uniforms.uTime.value = clock.elapsedTime;
  });

  // The planet mesh stays fixed (the dot grid is registered to lat/lon);
  // idle motion comes from OrbitControls auto-rotate instead.
  return (
    <mesh material={material} name="earth" {...picking}>
      <sphereGeometry args={[GLOBE_RADIUS, 128, 128]} />
    </mesh>
  );
}
