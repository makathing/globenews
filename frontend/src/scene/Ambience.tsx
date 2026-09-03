import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SUN_DIRECTION } from './Earth';
import { prefersReducedMotion, useTheme } from '../store';

/**
 * Things that are simply out there: two satellites in low orbit, a moon well
 * off in the dark, and a ship that crosses the far background every couple of
 * minutes. Nothing here is data — it exists so the sky around the planet is a
 * place rather than a void.
 *
 * The rules that keep it from becoming a distraction: everything is small
 * (the moon reads at roughly 15px, the ship at 16), slow, and dim enough to
 * sit under the bloom threshold; nothing crosses in front of the globe or the
 * UI; and nothing takes a pointer event, so a click always belongs to a
 * story. There are no lights in this scene, so each object shades itself from
 * the same SUN_DIRECTION the Earth uses.
 */

/* — self-shading material: the only lighting model in the scene — */
const sunlitVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vLocal;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunlitFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uAmbient;
  uniform float uBrightness;
  uniform float uMottle;
  varying vec3 vNormal;
  varying vec3 vLocal;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    float ndl = dot(normalize(vNormal), uSunDir);
    // a soft terminator rather than a hard one: this is a body seen from far
    // away, not a shaded primitive
    float lit = uAmbient + (1.0 - uAmbient) * smoothstep(-0.12, 0.4, ndl);
    vec3 color = uColor * lit;
    // darker patches, so a sphere reads as a surface with somewhere on it
    if (uMottle > 0.0) {
      float m = noise(vLocal * 9.0) * 0.6 + noise(vLocal * 21.0) * 0.4;
      color *= 1.0 - uMottle * smoothstep(0.45, 0.75, m);
    }
    gl_FragColor = vec4(color * uBrightness, 1.0);
  }
`;

function sunlitMaterial(color: string, ambient: number, mottle = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: sunlitVertex,
    fragmentShader: sunlitFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uAmbient: { value: ambient },
      uBrightness: { value: 1 },
      uMottle: { value: mottle },
    },
  });
}

/** Soft dot used for the blinking beacon and the engine glow. */
let glowTextureCache: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTextureCache) return glowTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
  }
  glowTextureCache = new THREE.CanvasTexture(canvas);
  return glowTextureCache;
}

/** Nothing out here is clickable; a click on the sky belongs to no story. */
const noRaycast = () => null;

interface Orbit {
  /** Above the tallest beam (1.295) and below OrbitControls' minDistance (1.75). */
  radius: number;
  inclination: number;
  node: number;
  /** Seconds per lap. */
  period: number;
  phase: number;
}

const ORBITS: Orbit[] = [
  { radius: 1.32, inclination: 0.91, node: 0.4, period: 75, phase: 0 },
  { radius: 1.42, inclination: 1.69, node: 2.3, period: 110, phase: 2.1 },
];

function Satellite({ orbit, brightness }: { orbit: Orbit; brightness: number }) {
  const group = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Sprite>(null);

  // orthonormal basis for the orbital plane, so the position is one cheap
  // combination per frame rather than three matrix rotations
  const { u, v, body, panel, beaconMaterial } = useMemo(() => {
    const normal = new THREE.Vector3(
      Math.sin(orbit.inclination) * Math.cos(orbit.node),
      Math.cos(orbit.inclination),
      Math.sin(orbit.inclination) * Math.sin(orbit.node),
    ).normalize();
    const seed = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const uAxis = new THREE.Vector3().crossVectors(seed, normal).normalize();
    const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();
    return {
      u: uAxis,
      v: vAxis,
      body: sunlitMaterial('#8d97a6', 0.16),
      panel: sunlitMaterial('#1c3054', 0.12),
      beaconMaterial: new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color('#ffd9a0'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    };
  }, [orbit]);

  useEffect(() => {
    body.uniforms.uBrightness.value = brightness;
    panel.uniforms.uBrightness.value = brightness;
  }, [body, panel, brightness]);

  const position = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!group.current) return;
    const t = prefersReducedMotion ? 0 : state.clock.elapsedTime;
    const angle = orbit.phase + (t / orbit.period) * Math.PI * 2;
    position
      .copy(u)
      .multiplyScalar(Math.cos(angle) * orbit.radius)
      .addScaledVector(v, Math.sin(angle) * orbit.radius);
    group.current.position.copy(position);
    // point +Z along the direction of travel
    const nudge = angle + 0.01;
    ahead
      .copy(u)
      .multiplyScalar(Math.cos(nudge) * orbit.radius)
      .addScaledVector(v, Math.sin(nudge) * orbit.radius);
    group.current.lookAt(ahead);

    if (beacon.current) {
      // a short blink roughly once a second, out of phase between the two
      const cycle = (state.clock.elapsedTime + orbit.phase) % 1.3;
      beacon.current.material.opacity = !prefersReducedMotion && cycle < 0.14 ? brightness : 0;
    }
  });

  return (
    <group ref={group}>
      <mesh material={body} raycast={noRaycast}>
        <boxGeometry args={[0.012, 0.012, 0.022]} />
      </mesh>
      <mesh material={panel} raycast={noRaycast}>
        <planeGeometry args={[0.11, 0.016]} />
      </mesh>
      <sprite ref={beacon} material={beaconMaterial} scale={[0.014, 0.014, 0.014]} />
    </group>
  );
}

/**
 * Far enough out to be scenery, placed up and to the right of the opening
 * framing so it is noticed rather than hunted for. Derived from the camera's
 * start position (SceneRoot) rather than hand-picked coordinates, which is
 * how the first attempt ended up behind the viewer. Fixed in world space, so
 * it drifts out of frame as you turn the globe — as it should.
 */
const MOON_POSITION = (() => {
  const forward = new THREE.Vector3(1.15, 0.95, 4.3).negate().normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return forward
    .clone()
    .addScaledVector(right, 0.42)
    .addScaledVector(up, 0.3)
    .normalize()
    .multiplyScalar(30);
})();

function Moon({ brightness }: { brightness: number }) {
  const material = useMemo(() => sunlitMaterial('#6c6c68', 0.05, 0.45), []);
  useEffect(() => {
    material.uniforms.uBrightness.value = brightness;
  }, [material, brightness]);
  return (
    <mesh position={MOON_POSITION} material={material} raycast={noRaycast}>
      <sphereGeometry args={[0.42, 24, 24]} />
    </mesh>
  );
}

/** First pass shortly after arrival, then every two to three minutes. */
const SHIP_FIRST_DELAY = 45;
const SHIP_GAP = 120;
const SHIP_GAP_JITTER = 60;
const SHIP_DURATION = 20;
/** How far past the globe the flight path sits, and how far off the planet's disc. */
const SHIP_DEPTH = 22;
const SHIP_OFFSET = 7.5;
const SHIP_HALF_SPAN = 11;

function Ship({ brightness }: { brightness: number }) {
  const group = useRef<THREE.Group>(null);
  const engine = useRef<THREE.Sprite>(null);
  const flight = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number } | null>(null);
  const nextLaunch = useRef(SHIP_FIRST_DELAY);

  const { hull, engineMaterial } = useMemo(
    () => ({
      hull: sunlitMaterial('#b9c1cc', 0.2),
      engineMaterial: new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color('#ffb36b'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }),
    [],
  );

  useEffect(() => {
    hull.uniforms.uBrightness.value = brightness;
  }, [hull, brightness]);

  const scratch = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state) => {
    if (!group.current) return;
    if (prefersReducedMotion) {
      group.current.visible = false;
      return;
    }
    const now = state.clock.elapsedTime;

    if (!flight.current && now >= nextLaunch.current) {
      // The path is laid out from where the camera is looking *at launch* and
      // then fixed in world space, so turning the globe mid-flight moves past
      // the ship the way it would move past anything else out there.
      const camera = state.camera;
      camera.getWorldDirection(scratch.dir);
      scratch.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      scratch.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      scratch.anchor
        .copy(scratch.dir)
        .multiplyScalar(SHIP_DEPTH)
        .addScaledVector(scratch.up, SHIP_OFFSET * (Math.random() < 0.5 ? 1 : -1));
      flight.current = {
        from: scratch.anchor.clone().addScaledVector(scratch.right, -SHIP_HALF_SPAN),
        to: scratch.anchor.clone().addScaledVector(scratch.right, SHIP_HALF_SPAN),
        start: now,
      };
    }

    const active = flight.current;
    if (!active) {
      group.current.visible = false;
      return;
    }

    const t = (now - active.start) / SHIP_DURATION;
    if (t >= 1) {
      flight.current = null;
      nextLaunch.current = now + SHIP_GAP + Math.random() * SHIP_GAP_JITTER;
      group.current.visible = false;
      return;
    }

    group.current.visible = true;
    group.current.position.lerpVectors(active.from, active.to, t);
    scratch.ahead.lerpVectors(active.from, active.to, Math.min(t + 0.01, 1));
    group.current.lookAt(scratch.ahead);
    if (engine.current) {
      engine.current.material.opacity = brightness * (0.8 + 0.2 * Math.sin(now * 23));
    }
  });

  return (
    <group ref={group} visible={false}>
      {/* nose along +Z, which lookAt points down the flight path */}
      <mesh material={hull} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.05, 0.4, 6]} />
      </mesh>
      <mesh material={hull} raycast={noRaycast}>
        <planeGeometry args={[0.22, 0.09]} />
      </mesh>
      <sprite ref={engine} material={engineMaterial} position={[0, 0, -0.22]} scale={[0.16, 0.16, 0.16]} />
    </group>
  );
}

export function Ambience() {
  const theme = useTheme();
  // starBrightness already means "how bright is the sky here", so the scenery
  // follows it rather than introducing a second knob
  const brightness = theme.starBrightness;

  return (
    <group name="ambience">
      <Moon brightness={brightness} />
      {ORBITS.map((orbit) => (
        <Satellite key={orbit.node} orbit={orbit} brightness={brightness} />
      ))}
      <Ship brightness={brightness} />
    </group>
  );
}
