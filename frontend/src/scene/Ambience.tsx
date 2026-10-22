import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SUN_DIRECTION } from './Earth';
import { prefersReducedMotion, useTheme } from '../store';

/**
 * Things that are simply out there: two satellites in low orbit, a moon well
 * off in the dark, and a ship orbiting further out. Nothing here is data
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
 * framing so it is noticed rather than hunted for. Direction comes from the
 * camera's start vector (SceneRoot) rather than hand-picked coordinates, which
 * is how the first attempt ended up behind the viewer.
 *
 * The offsets are fractions of the *actual* field of view, not constants: with
 * a perspective camera, `right · f · tan(hfov/2)` lands at exactly `f` in NDC,
 * so the moon sits at the same spot on screen whatever the aspect. It used to
 * be a fixed world offset tuned against a landscape frustum — and since
 * `fov: 45` is the *vertical* fov, a portrait phone has barely a third of a
 * desktop's horizontal field, which put the moon well off the side of every
 * phone. Fixed in world space once placed, so it drifts out of frame as you
 * turn the globe — as it should.
 */
const MOON_FORWARD = new THREE.Vector3(1.15, 0.95, 4.3).negate().normalize();
const MOON_RIGHT = new THREE.Vector3()
  .crossVectors(MOON_FORWARD, new THREE.Vector3(0, 1, 0))
  .normalize();
const MOON_UP = new THREE.Vector3().crossVectors(MOON_RIGHT, MOON_FORWARD).normalize();
const MOON_DISTANCE = 30;
/** Where it lands in NDC: right of centre, high, clear of the rail and the chip. */
const MOON_NDC_X = 0.65;
const MOON_NDC_Y = 0.75;

function placeMoon(target: THREE.Vector3, camera: THREE.PerspectiveCamera): void {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * camera.aspect;
  target
    .copy(MOON_FORWARD)
    .addScaledVector(MOON_RIGHT, MOON_NDC_X * tanH)
    .addScaledVector(MOON_UP, MOON_NDC_Y * tanV)
    .normalize()
    .multiplyScalar(MOON_DISTANCE);
}

function Moon({ brightness }: { brightness: number }) {
  const material = useMemo(() => sunlitMaterial('#6c6c68', 0.05, 0.45), []);
  const meshRef = useRef<THREE.Mesh>(null);
  const aspectRef = useRef(0);
  useEffect(() => {
    material.uniforms.uBrightness.value = brightness;
  }, [material, brightness]);
  // r3f mutates the camera on resize without re-rendering, so this is a frame
  // check rather than a memo — and it costs one float compare per frame.
  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    if (!meshRef.current || camera.aspect === aspectRef.current) return;
    aspectRef.current = camera.aspect;
    placeMoon(meshRef.current.position, camera);
  });
  return (
    <mesh ref={meshRef} material={material} raycast={noRaycast}>
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
/** Mean orbital radius: above both satellites, clear of the tallest beam. */
const SHIP_ORBIT_RADIUS = 1.62;
/** Radians per second at rest — about 45 seconds a lap. A burst multiplies this. */
const SHIP_BASE_SPEED = (Math.PI * 2) / 45;
/** Tilt of the orbital plane, and how fast that plane swings round the pole. */
const SHIP_INCLINATION = 0.55;
const SHIP_PRECESSION = 0.012;
/** Lookahead (radians of orbit) used to derive heading and turn from the path. */
const SHIP_STEP = 0.06;
/** Flutter: a bob, in ship-lengths, not a vibration. */
const SHIP_FLUTTER = 0.12;

/**
 * Where the ship is at orbital angle `a`, `t` seconds in: a real orbit round
 * the planet, in world space, so it passes in front and behind and moves with
 * the globe when you drag it. The plane slowly precesses, so successive laps
 * cross different parts of the sky rather than the same arc; a gentle weave in
 * altitude and across the plane gives it something to bank into.
 */
function shipOrbitPoint(a: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const node = 0.8 + t * SHIP_PRECESSION;
  const r = SHIP_ORBIT_RADIUS * (1 + 0.05 * Math.sin(2.3 * a));
  const lift = 0.07 * Math.sin(1.7 * a + 0.6);
  // the orbit drawn in a flat plane, then tilted and turned into place
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const ci = Math.cos(SHIP_INCLINATION);
  const si = Math.sin(SHIP_INCLINATION);
  const y = z * si + lift * ci;
  const zt = z * ci - lift * si;
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  return out.set(x * cn - zt * sn, y, x * sn + zt * cn);
}

/**
 * A small craft orbiting the planet.
 *
 * It used to fly a path pinned to the camera, which kept it always in frame
 * but meant it sat still on screen while the globe turned beneath it — it
 * never went *round* anything. Now it holds a real, slowly precessing orbit,
 * so it crosses in front of the planet, slips behind the limb and comes back,
 * and drags with the globe like everything else up here. Its size is still
 * clamped in pixels, so passing near the camera never fills the frame.
 *
 * Personality is all in the motion: it cruises, then bursts forward with the
 * engine flaring, flutters like something small holding a heading, and banks
 * into its own weave.
 */
function Ship({ brightness }: { brightness: number }) {
  const group = useRef<THREE.Group>(null);
  const engine = useRef<THREE.Sprite>(null);
  /** Orbital angle travelled, advanced at a variable rate. */
  const orbitPos = useRef(Math.random() * Math.PI * 2);
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
      here: new THREE.Vector3(),
      next: new THREE.Vector3(),
      after: new THREE.Vector3(),
      heading: new THREE.Vector3(),
      turn: new THREE.Vector3(),
      out: new THREE.Vector3(),
      lateral: new THREE.Vector3(),
      aim: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const ship = group.current;
    if (!ship) return;
    const t = prefersReducedMotion ? 0 : state.clock.elapsedTime;
    const camera = state.camera as THREE.PerspectiveCamera;

    // A burst every ~48s: mostly cruising, then a sharp couple of seconds at ~4x.
    const burst = prefersReducedMotion
      ? 0
      : Math.pow(Math.max(Math.sin(0.13 * t + 2.1), 0), 8) * 3;
    if (!prefersReducedMotion) {
      orbitPos.current += delta * SHIP_BASE_SPEED * (1 + burst);
    }
    const a = orbitPos.current;

    shipOrbitPoint(a, t, scratch.here);
    shipOrbitPoint(a + SHIP_STEP, t, scratch.next);
    shipOrbitPoint(a + SHIP_STEP * 2, t, scratch.after);

    // hold a near-constant size on screen, whatever the distance
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distance = camera.position.distanceTo(scratch.here);
    const worldPerPixel = (2 * distance * tanHalf) / state.size.height;
    const naturalPx = SHIP_LENGTH / worldPerPixel;
    const targetPx = Math.min(Math.max(naturalPx, SHIP_MIN_PX), SHIP_MAX_PX);
    const scale = targetPx / naturalPx;
    ship.scale.setScalar(scale);

    // Heading from the *clean* path, before any flutter — deriving it from the
    // fluttered point is what once made the ship spin on the spot.
    scratch.heading.subVectors(scratch.next, scratch.here).normalize();
    scratch.turn.subVectors(scratch.after, scratch.next).normalize().sub(scratch.heading);
    // "up" for the ship is away from the planet: it flies belly-down
    scratch.out.copy(scratch.here).normalize();
    scratch.lateral.crossVectors(scratch.heading, scratch.out).normalize();

    // flutter, sized against the ship so it reads the same near or far, and
    // applied only to where it is drawn, never to where it points
    const wobble = prefersReducedMotion ? 0 : SHIP_LENGTH * scale * SHIP_FLUTTER;
    scratch.here.addScaledVector(scratch.lateral, Math.sin(3.1 * t) * wobble);
    scratch.here.addScaledVector(scratch.out, Math.sin(2.3 * t + 1.2) * wobble);
    ship.position.copy(scratch.here);
    ship.up.copy(scratch.out);
    ship.lookAt(scratch.aim.copy(scratch.here).add(scratch.heading));

    // bank into the weave
    const targetBank =
      Math.min(Math.max(scratch.turn.dot(scratch.lateral) * 14, -0.7), 0.7) +
      (prefersReducedMotion ? 0 : Math.sin(1.7 * t) * 0.08);
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
    <group ref={group} name="ship">
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
