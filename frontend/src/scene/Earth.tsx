import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../lib/geo';
import {
  DOT_LEVELS,
  buildEventDots,
  continuousDotLevel,
  pickDotLevel,
} from '../lib/eventDots';
import { dotLevel, prefersReducedMotion, useTheme, useVisibleEvents } from '../store';
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
  // two dot grids (coarse A, fine B) crossfaded by uLevelMix while zooming
  uniform sampler2D eventColorA;  // rgb category colour, a weight
  uniform sampler2D eventPulseA;  // r pulses?, g phase
  uniform sampler2D eventColorB;
  uniform sampler2D eventPulseB;
  uniform vec2 uGridA;
  uniform vec2 uGridB;
  uniform float uLevelMix;
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

  // the halftone layer for one grid: rgb = dot colour, a = dot coverage
  vec4 dotLayer(sampler2D eventColor, sampler2D eventPulse, vec2 gridSize, float land, float shade) {
    vec2 grid = vUv * gridSize;
    vec2 cellUv = (floor(grid) + 0.5) / gridSize;
    vec2 cell = fract(grid) - 0.5;

    // every dot reads its story at its own centre, so it shows one flat colour
    vec4 ev = texture2D(eventColor, cellUv);
    vec4 pl = texture2D(eventPulse, cellUv);
    float lit = step(0.002, ev.a);
    float pulse = 1.0 + pl.r * 0.12 * sin(uTime * 2.2 + pl.g * 6.2832);
    float strength = clamp((0.35 + 0.55 * ev.a) * pulse, 0.0, 1.0) * lit;

    // shrink dots toward the coast so edges feather instead of clipping;
    // a story offshore lights its dots over the sea as well
    float density = max(smoothstep(0.25, 0.75, land), lit);
    // at most ~10% larger, so neighbours always keep their gap
    float radial = length(cell) / (1.0 + 0.1 * ev.a * lit);
    float dotMask = smoothstep(0.42, 0.16, radial) * density;

    return vec4(mix(uDot * shade, ev.rgb, strength), dotMask);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float facing = max(dot(normal, viewDir), 0.0);
    // soft key light so the sphere keeps its volume
    float shade = 0.72 + 0.28 * clamp(dot(normal, sunDir) * 0.5 + 0.5, 0.0, 1.0);

    // ocean: brighter facing the viewer, deepening toward the limb
    vec3 ocean = mix(uLimb, uOcean, smoothstep(0.0, 0.9, facing));

    float land = 1.0 - texture2D(waterMap, vUv).r;
    vec4 dotsA = dotLayer(eventColorA, eventPulseA, uGridA, land, shade);
    vec3 color = mix(ocean, dotsA.rgb, dotsA.a);
    // uniform branch: only mid-crossfade pays for the second grid
    if (uLevelMix > 0.0) {
      vec4 dotsB = dotLayer(eventColorB, eventPulseB, uGridB, land, shade);
      color = mix(color, mix(ocean, dotsB.rgb, dotsB.a), uLevelMix);
    }

    // subtle inner rim, brightest on the sunlit limb
    float fresnel = pow(1.0 - facing, 3.0);
    float litSide = 0.2 + 0.8 * smoothstep(-0.35, 0.55, dot(normal, sunDir));
    color += fresnel * uRim * uRimStrength * litSide;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** How long a crossfade between two dot grids takes, in seconds. */
const LEVEL_FADE_SECONDS = 0.25;

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
        eventColorA: { value: null },
        eventPulseA: { value: null },
        eventColorB: { value: null },
        eventPulseB: { value: null },
        uGridA: { value: new THREE.Vector2(DOT_LEVELS[0], DOT_LEVELS[0] / 2) },
        uGridB: { value: new THREE.Vector2(DOT_LEVELS[0], DOT_LEVELS[0] / 2) },
        uLevelMix: { value: 0 },
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

  // one set of story textures per zoom level (~70 stories: cheap to build)
  const levels = useMemo(
    () => DOT_LEVELS.map((width) => buildEventDots(events, theme.light, width)),
    [events, theme.light],
  );

  useEffect(
    () => () => {
      for (const dots of levels) {
        dots.color.dispose();
        dots.pulse.dispose();
      }
    },
    [levels],
  );

  // the grid being faded from and to (indices into DOT_LEVELS) and how far
  // along the fade is; from === to (and progress 1) when settled on one grid.
  // null until the first frame snaps it to the opening framing.
  const fade = useRef<{ from: number; to: number; progress: number } | null>(null);

  useEffect(() => {
    const u = material.uniforms;
    (u.uOcean.value as THREE.Color).set(theme.ocean);
    (u.uLimb.value as THREE.Color).set(theme.limb);
    (u.uDot.value as THREE.Color).set(theme.dot);
    (u.uRim.value as THREE.Color).set(theme.rim);
    u.uRimStrength.value = theme.light ? 0.1 : 0.16;
  }, [material, theme]);

  useFrame(({ clock, camera, size }, delta) => {
    const u = material.uniforms;
    if (!prefersReducedMotion) u.uTime.value = clock.elapsedTime;

    // Dot density follows zoom: the globe's projected radius in CSS pixels
    // decides the finest grid whose cells still read as crisp, separate dots;
    // a change of grid crossfades over a quarter second, then settles on one.
    const distance = Math.max(camera.position.length(), GLOBE_RADIUS * 1.0001);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 45;
    const focal = size.height / 2 / Math.tan((fov * Math.PI) / 360);
    const radiusPx = (focal * GLOBE_RADIUS) / Math.sqrt(distance * distance - GLOBE_RADIUS * GLOBE_RADIUS);
    const level = continuousDotLevel(radiusPx);
    let f = fade.current;
    if (!f) f = fade.current = { from: 0, to: pickDotLevel(level, 0), progress: 1 };
    f.from = f.progress >= 1 ? f.to : f.from;
    const next = pickDotLevel(level, f.to);
    if (next !== f.to) {
      // mid-fade, keep whichever grid is showing more so nothing jumps
      if (f.progress < 1 && f.progress >= 0.5) f.from = f.to;
      f.to = next;
      f.progress = f.from === next ? 1 : 0;
    }
    if (f.progress < 1) {
      f.progress = prefersReducedMotion ? 1 : Math.min(1, f.progress + delta / LEVEL_FADE_SECONDS);
    }
    const t = f.progress;
    const mix = t >= 1 ? 0 : t * t * (3 - 2 * t);
    const a = t >= 1 ? f.to : f.from;
    const b = f.to;

    u.eventColorA.value = levels[a].color;
    u.eventPulseA.value = levels[a].pulse;
    u.eventColorB.value = levels[b].color;
    u.eventPulseB.value = levels[b].pulse;
    (u.uGridA.value as THREE.Vector2).set(DOT_LEVELS[a], DOT_LEVELS[a] / 2);
    (u.uGridB.value as THREE.Vector2).set(DOT_LEVELS[b], DOT_LEVELS[b] / 2);
    u.uLevelMix.value = mix;
    // picking follows the finer of the two grids on screen
    dotLevel.width = DOT_LEVELS[Math.max(a, b)];
  });

  // The planet mesh stays fixed (the dot grid is registered to lat/lon);
  // idle motion comes from OrbitControls auto-rotate instead.
  return (
    <mesh material={material} name="earth" {...picking}>
      <sphereGeometry args={[GLOBE_RADIUS, 128, 128]} />
    </mesh>
  );
}
