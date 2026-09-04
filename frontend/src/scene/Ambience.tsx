import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SUN_DIRECTION } from './Earth';
import { prefersReducedMotion, useTheme } from '../store';

/**
 * Things that are simply out there: two satellites in low orbit, a moon well
 * off in the dark, and a ship going about its business. Nothing here is data
 * — it exists so the sky around the planet is a place rather than a void.
 *
 * The rules that keep it from becoming a distraction: everything is small
 * (the moon reads at roughly 15px, the ship between 14 and 28), slow enough
 * to be scenery, and dim enough to sit under the bloom threshold; and nothing
 * takes a pointer event, so a click always belongs to a story even when the
 * ship is crossing the globe. There are no lights in this scene, so each
 * object shades itself from the same SUN_DIRECTION the Earth uses.
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
        // cool, not warm: severity markers own the warm end of the palette now,
        // and a warm blink over the globe reads as a story that isn't there
        color: new THREE.Color('#dceaff'),
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

/**
 * The ship's shape, in world units before the on-screen size clamp below.
 * Nose along +Z, which is where `lookAt` points.
 */
const SHIP_LENGTH = 0.4;
/** On-screen length it is held between, in CSS pixels. */
const SHIP_MIN_PX = 14;
const SHIP_MAX_PX = 30;
/** Path units per second at rest; a burst multiplies this. */
const SHIP_BASE_SPEED = 0.16;
/** Lookahead used to derive heading and turn rate from the path. */
const SHIP_STEP = 0.03;

/**
 * Where the ship sits at path position `s`, as a point in the camera's own
 * frame: `x` and `y` are fractions of the visible half-width and half-height,
 * and `depth` is a multiple of the camera's distance to the globe.
 *
 * Anchoring to the view rather than to world coordinates is what makes "always
 * there" true. A world-fixed wanderer spends most of its life outside the
 * frustum — badly so on a phone, where the horizontal field of view is about
 * eleven degrees — and a ship you only glimpse once a minute is the thing we
 * were trying to get away from. Kept inside ±0.9 it is always somewhere on
 * screen; the depth sweep is what carries it in front of the planet and back
 * behind it.
 */
function shipViewPoint(s: number): { x: number; y: number; depth: number } {
  return {
    // biased right of centre so it does not spend its time hidden behind the
    // rail on a desktop layout
    x: 0.2 + 0.62 * Math.sin(0.37 * s) * Math.cos(0.19 * s + 0.7),
    y: 0.52 * Math.sin(0.29 * s + 1.3) + 0.18 * Math.sin(0.71 * s),
    // 0.42x to 1.45x the camera's distance: well in front of the globe's near
    // face at one end, comfortably behind its centre at the other
    depth: 0.935 + 0.515 * Math.sin(0.13 * s + 0.4),
  };
}

/**
 * A small craft going about its business, always somewhere in frame.
 *
 * It used to be a scheduled straight line far behind the planet, absent most
 * of the time. Now it roams the whole view — including across the globe —
 * which only works because its size is clamped in *pixels*: the same hull at
 * the near end of its depth range would otherwise be a few hundred pixels of
 * spaceship across the middle of the map. Held between 14 and 30px it keeps a
 * hint of parallax and can never take over the frame.
 *
 * Personality is all in the motion: it drifts, then bursts forward with the
 * engine flaring, flutters constantly like something small holding a heading
 * in a breeze, and banks into its own turns.
 */
function Ship({ brightness }: { brightness: number }) {
  const group = useRef<THREE.Group>(null);
  const engine = useRef<THREE.Sprite>(null);
  /** Distance travelled along the path, advanced at a variable rate. */
  const pathPos = useRef(Math.random() * 40);
  const bankRef = useRef(0);

  const { hull, engineMaterial } = useMemo(
    () => ({
      hull: sunlitMaterial('#b9c1cc', 0.2),
      engineMaterial: new THREE.SpriteMaterial({
        map: glowTexture(),
        // same rule as the satellite beacons: ambient lights are cool so they
        // are never mistaken for a marker when the ship crosses the planet
        color: new THREE.Color('#cfe6ff'),
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
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      here: new THREE.Vector3(),
      next: new THREE.Vector3(),
      after: new THREE.Vector3(),
      heading: new THREE.Vector3(),
      turn: new THREE.Vector3(),
      lateral: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const ship = group.current;
    if (!ship) return;
    const t = state.clock.elapsedTime;
    const camera = state.camera as THREE.PerspectiveCamera;

    // A burst every ~48s: mostly nothing, then a sharp couple of seconds at ~4x.
    const burst = prefersReducedMotion
      ? 0
      : Math.pow(Math.max(Math.sin(0.13 * t + 2.1), 0), 8) * 3;
    if (!prefersReducedMotion) {
      pathPos.current += delta * SHIP_BASE_SPEED * (1 + burst);
    }
    const s = pathPos.current;

    // the camera's own frame, which the path is expressed in
    scratch.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    scratch.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    camera.getWorldDirection(scratch.forward);
    const camDistance = camera.position.length();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

    const place = (at: number, out: THREE.Vector3) => {
      const p = shipViewPoint(at);
      const depth = p.depth * camDistance;
      const halfHeight = depth * tanHalf;
      const halfWidth = halfHeight * camera.aspect;
      return out
        .copy(camera.position)
        .addScaledVector(scratch.forward, depth)
        .addScaledVector(scratch.right, p.x * halfWidth)
        .addScaledVector(scratch.up, p.y * halfHeight);
    };

    place(s, scratch.here);
    place(s + SHIP_STEP, scratch.next);
    place(s + SHIP_STEP * 2, scratch.after);

    // hold a near-constant size on screen, whatever the depth
    const distance = camera.position.distanceTo(scratch.here);
    const worldPerPixel = (2 * distance * tanHalf) / state.size.height;
    const naturalPx = SHIP_LENGTH / worldPerPixel;
    const targetPx = Math.min(Math.max(naturalPx, SHIP_MIN_PX), SHIP_MAX_PX);
    const scale = targetPx / naturalPx;
    ship.scale.setScalar(scale);

    // flutter, sized against the ship rather than the world, so the wobble
    // reads the same whether it is near or far
    const wobble = prefersReducedMotion ? 0 : SHIP_LENGTH * scale * 0.4;
    scratch.here.addScaledVector(scratch.right, Math.sin(11.3 * t) * wobble);
    scratch.here.addScaledVector(scratch.up, Math.sin(9.7 * t + 1.2) * wobble);
    ship.position.copy(scratch.here);

    // heading from the path itself, then bank into the turn
    scratch.heading.subVectors(scratch.next, scratch.here).normalize();
    ship.lookAt(scratch.next);
    scratch.turn.subVectors(scratch.after, scratch.next).normalize().sub(scratch.heading);
    scratch.lateral.crossVectors(scratch.heading, scratch.up).normalize();
    const targetBank =
      Math.min(Math.max(scratch.turn.dot(scratch.lateral) * 22, -1.1), 1.1) +
      (prefersReducedMotion ? 0 : Math.sin(7.9 * t) * 0.14);
    bankRef.current += (targetBank - bankRef.current) * Math.min(delta * 3, 1);
    ship.rotateZ(bankRef.current);

    if (engine.current) {
      // the engine is how a burst reads: brighter and bigger while it runs
      const flicker = prefersReducedMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 23);
      engine.current.material.opacity = Math.min(brightness * flicker * (0.55 + burst * 0.5), 1);
      engine.current.scale.setScalar(0.16 * (1 + burst * 0.9));
    }
  });

  return (
    <group ref={group}>
      {/* nose along +Z, which lookAt points down the flight path */}
      <mesh material={hull} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.05, SHIP_LENGTH, 6]} />
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
