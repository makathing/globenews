import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CATEGORIES, type Category, type NewsEvent } from '../../../shared/news';
import { beamColor, freshnessClock } from '../lib/beams';
import { GLOBE_RADIUS } from '../lib/geo';
import { getSculptureGeometry } from '../lib/sculptureGeometry';
import {
  SCULPTURE_BASE_LIFT,
  SCULPTURE_BODY_BRIGHTNESS,
  SCULPTURE_GLOW_HEIGHT,
  SCULPTURE_GLOW_SIZE,
  SCULPTURE_HEIGHT,
  SCULPTURE_MAX_PX,
  SCULPTURE_MAX_PX_COARSE,
  SCULPTURE_MIN_PX,
  sculpturePhase,
  sculptureScale,
} from '../lib/sculptures';
import { coarsePointer, prefersReducedMotion, useGlobeStore, useTheme, useVisibleEvents } from '../store';
import { SUN_DIRECTION } from './Earth';
import {
  DEFAULT_DISTANCE,
  FAR_DISTANCE,
  surfaceFrame,
  useInstancedMarkerPointer,
} from './markerShared';

/**
 * Small sculptures standing on the surface, one silhouette per category, in
 * the same family as the satellites and the ship (Ambience.tsx): sunlit
 * low-poly bodies, cool grey, lit from SUN_DIRECTION because the scene has no
 * lights. Severity sets the size and the warm glow at the object's heart;
 * freshness sets how bright that glow burns; breaking stories strobe and send
 * a ring out across the ground. Nothing rotates. The life is all in the light:
 * each object breathes and ticks on its own phase, and the whole field rises
 * out of the ground when a dataset lands.
 *
 * The budget is what shapes the code. Beams and pins pay a draw call, a
 * material and a useFrame per story; here every story is an instance, so the
 * cost is eight body meshes (one per category), one glow quad, one breaking
 * ring and one invisible hit mesh — ten draw calls whatever the count, one
 * frame callback, and all animation in the shaders from uTime and a
 * per-instance phase. The hit mesh is never drawn (the renderer skips
 * invisible objects; the raycaster does not), which is the same trick
 * MarkerHitTarget relies on. RenderStats (dev only) counts the result.
 *
 * Size is held on screen like a pin's head: the vertex shader clamps the
 * severity-3 reference height between SCULPTURE_MIN_PX and _MAX_PX, so a
 * cluster from orbit is a cluster of shapes rather than a pile, and a close
 * approach never fills the frame with one of them.
 *
 * The trade, shared with pins: sculptures are short and depth-tested, so a
 * far-side story doesn't crest the limb the way a tall beam does. The rail and
 * the fly-to on select remain the way round the planet.
 */

/* — shared vertex preamble: the screen-size clamp and the rise-in — */
const instanceAttributes = /* glsl */ `
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aSeverity;
  attribute float aBreaking;
  attribute float aFresh;
  attribute float aBoost;
`;

const clampUniforms = /* glsl */ `
  uniform float uTanHalfFov;
  uniform float uViewportHeight;
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uNominalHeight;
  uniform float uTime;
  uniform float uSpawnTime;
  uniform float uRiseEnabled;
`;

/**
 * `k` scales the instance so the reference height lands inside the pixel
 * range (the instance's own severity scale rides on top, so the ratio between
 * neighbours survives the clamp); `rise` is the growth from the ground after a
 * spawn; `far` is markerShared's farFor, for thinning glow at full zoom-out.
 */
const clampBody = /* glsl */ `
  vec4 baseView = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float dist = length(baseView.xyz);
  float worldPerPx = 2.0 * dist * uTanHalfFov / uViewportHeight;
  float naturalPx = uNominalHeight / worldPerPx;
  float k = clamp(naturalPx, uMinPx, uMaxPx) / naturalPx * (1.0 + 0.22 * aBoost);
  float rise = 1.0;
  if (uRiseEnabled > 0.5) {
    rise = max(smoothstep(0.0, 1.0, (uTime - uSpawnTime - aPhase * 0.6) / 0.7), 0.02);
  }
  float far = clamp((dist - ${DEFAULT_DISTANCE.toFixed(2)}) / ${(FAR_DISTANCE - DEFAULT_DISTANCE).toFixed(2)}, 0.0, 1.0);
`;

/* — body: the sculpture itself, opaque and self-shaded — */
const bodyVertex = /* glsl */ `
  ${instanceAttributes}
  ${clampUniforms}
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vPhase;
  varying float vBreaking;
  varying float vFresh;
  varying float vBoost;
  varying float vLocalY;

  void main() {
    ${clampBody}
    vec3 local = position * k;
    local.y *= rise;
    // the instance scale is uniform, so the rotation part of instanceMatrix
    // carries normals correctly once renormalised; normalMatrix is per-mesh
    // and knows nothing about instances
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vColor = aColor;
    vPhase = aPhase;
    vBreaking = aBreaking;
    vFresh = aFresh;
    vBoost = aBoost;
    vLocalY = position.y / uNominalHeight;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(local, 1.0);
  }
`;

const bodyFragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uBodyColor;
  uniform float uAmbient;
  uniform float uBrightness;
  uniform float uTime;
  uniform float uMotion;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vPhase;
  varying float vBreaking;
  varying float vFresh;
  varying float vBoost;
  varying float vLocalY;

  void main() {
    // the Ambience lighting model: a soft terminator, a body seen from afar
    float ndl = dot(normalize(vNormal), uSunDir);
    float lit = uAmbient + (1.0 - uAmbient) * smoothstep(-0.12, 0.4, ndl);
    vec3 color = uBodyColor * lit;
    // the severity colour glows through the grey a little, more when hovered
    color = mix(color, vColor, 0.16 + 0.14 * vBoost);
    // a short tick of light at the very top, each object on its own clock
    float tip = smoothstep(0.75, 1.0, vLocalY);
    float blink = uMotion * step(fract(uTime * 0.37 + vPhase * 3.1), 0.05);
    color += vColor * tip * blink * 0.8;
    // breaking: the whole object flashes white once a second
    float strobe = vBreaking * uMotion * smoothstep(0.08, 0.0, fract(uTime * 0.9 + vPhase)) * 0.6;
    color = mix(color, vec3(1.0), strobe);
    gl_FragColor = vec4(color * uBrightness * (0.8 + 0.2 * vFresh), 1.0);
  }
`;

/* — glow: a pool of light on the ground the sculpture stands in, additive — */
const glowVertex = /* glsl */ `
  ${instanceAttributes}
  ${clampUniforms}
  uniform float uGlowHeight;
  uniform float uGlowSize;
  uniform float uMotion;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vPhase;
  varying float vSeverity;
  varying float vBreaking;
  varying float vFresh;
  varying float vBoost;
  varying float vFar;
  varying float vRise;
  varying float vBreathe;

  void main() {
    ${clampBody}
    float instScale = length(instanceMatrix[1].xyz);
    float breathe = sin(uTime * 1.3 + aPhase * 6.283) * uMotion;
    float size = uGlowSize * k * instScale * (1.0 + 0.5 * aBoost) * (1.0 + 0.06 * breathe);
    vec4 centerView = modelViewMatrix * instanceMatrix * vec4(0.0, uGlowHeight * k * rise, 0.0, 1.0);
    vec3 offset = vec3(position.x, position.y, 0.0) * size;
    gl_Position = projectionMatrix * (centerView + vec4(offset, 0.0));
    vUv = uv;
    vColor = aColor;
    vPhase = aPhase;
    vSeverity = aSeverity;
    vBreaking = aBreaking;
    vFresh = aFresh;
    vBoost = aBoost;
    vFar = far;
    vRise = rise;
    vBreathe = breathe;
  }
`;

const glowFragment = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vPhase;
  varying float vSeverity;
  varying float vBreaking;
  varying float vFresh;
  varying float vBoost;
  varying float vFar;
  varying float vRise;
  varying float vBreathe;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    // the same falloff as Ambience's glow sprite, without the texture bind
    float a = pow(max(1.0 - d, 0.0), 2.2);
    a *= (0.45 + 0.55 * vFresh) * (0.55 + 0.45 * vSeverity);
    a *= 0.85 + 0.15 * vBreathe;
    a *= (1.0 + vBoost) * uIntensity * vRise * 0.55;
    // many glows overlap at full zoom-out; thin them so a cluster stays a cluster
    a *= mix(1.0, 0.65, vFar);
    vec3 color = vColor;
    float strobe = vBreaking * uMotion * (0.5 + 0.5 * sin(uTime * 7.0 + vPhase));
    color = mix(color, vec3(1.0), strobe * 0.5);
    if (a < 0.004) discard;
    gl_FragColor = vec4(color, min(a, 1.0));
  }
`;

/* — ring: a pulse leaving a breaking story across the ground — */
const ringVertex = /* glsl */ `
  ${instanceAttributes}
  ${clampUniforms}
  uniform float uMotion;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    ${clampBody}
    float p = uMotion > 0.5 ? fract(uTime * 0.9 + aPhase) : 0.45;
    float ringScale = uNominalHeight * 0.6 * k * (0.4 + 1.6 * p);
    // the geometry lies in XZ; sit it just above the borders layer
    vec3 local = vec3(position.x * ringScale, 0.004, position.z * ringScale);
    vColor = aColor;
    vAlpha = (1.0 - p) * 0.7 * rise;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(local, 1.0);
  }
`;

const ringFragment = /* glsl */ `
  uniform float uIntensity;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float a = vAlpha * uIntensity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.4), a);
  }
`;

/** Per-instance data every mesh carries; the body meshes get one set each. */
interface InstanceAttrs {
  aColor: THREE.InstancedBufferAttribute;
  aPhase: THREE.InstancedBufferAttribute;
  aSeverity: THREE.InstancedBufferAttribute;
  aBreaking: THREE.InstancedBufferAttribute;
  aFresh: THREE.InstancedBufferAttribute;
  aBoost: THREE.InstancedBufferAttribute;
}

function makeInstanceAttrs(geometry: THREE.BufferGeometry, capacity: number): InstanceAttrs {
  const n = Math.max(capacity, 1);
  const attr = (size: number, dynamic = false) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
    if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const attrs: InstanceAttrs = {
    aColor: attr(3),
    aPhase: attr(1),
    aSeverity: attr(1),
    aBreaking: attr(1),
    aFresh: attr(1, true),
    aBoost: attr(1, true),
  };
  for (const [name, a] of Object.entries(attrs)) geometry.setAttribute(name, a);
  return attrs;
}

function writeInstance(attrs: InstanceAttrs, i: number, event: NewsEvent, color: THREE.Color, fresh: number) {
  attrs.aColor.setXYZ(i, color.r, color.g, color.b);
  attrs.aPhase.setX(i, sculpturePhase(event.id));
  attrs.aSeverity.setX(i, (event.severity - 1) / 4);
  attrs.aBreaking.setX(i, event.isBreaking ? 1 : 0);
  attrs.aFresh.setX(i, fresh);
  attrs.aBoost.setX(i, 0);
}

function touchAll(attrs: InstanceAttrs) {
  for (const a of Object.values(attrs)) a.needsUpdate = true;
}

/** Everything allocated for one dataset: capacities come from the unfiltered list. */
interface Rig {
  bodies: Record<Category, THREE.InstancedMesh>;
  bodyAttrs: Record<Category, InstanceAttrs>;
  glow: THREE.InstancedMesh;
  glowAttrs: InstanceAttrs;
  ring: THREE.InstancedMesh;
  ringAttrs: InstanceAttrs;
  hit: THREE.InstancedMesh;
  /** Set when the buffers are (re)built, so the field rises in on the next frame. */
  spawnPending: boolean;
}

/** Where every visible story sits, rebuilt whenever the visible list changes. */
interface Layout {
  flat: NewsEvent[];
  idToIndex: Map<string, number>;
  basePos: Float32Array;
  baseQuat: Float32Array;
  sevScale: Float32Array;
  /** Index of each story inside its category's body mesh. */
  bodyIndex: Int32Array;
  /** Index inside the ring mesh, or -1 when not breaking. */
  ringIndex: Int32Array;
  boost: Float32Array;
  fresh: ((now: number) => number)[];
}

const EMPTY_EVENTS: NewsEvent[] = [];

const EMPTY_LAYOUT: Layout = {
  flat: [],
  idToIndex: new Map(),
  basePos: new Float32Array(0),
  baseQuat: new Float32Array(0),
  sevScale: new Float32Array(0),
  bodyIndex: new Int32Array(0),
  ringIndex: new Int32Array(0),
  boost: new Float32Array(0),
  fresh: [],
};

interface Materials {
  body: THREE.ShaderMaterial;
  glow: THREE.ShaderMaterial;
  ring: THREE.ShaderMaterial;
  /** Uniform objects shared by all three, so one write reaches every shader. */
  shared: Record<string, THREE.IUniform>;
}

function makeMaterials(): Materials {
  const shared = {
    uTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(45) / 2) },
    uViewportHeight: { value: 800 },
    uMinPx: { value: SCULPTURE_MIN_PX },
    uMaxPx: { value: coarsePointer ? SCULPTURE_MAX_PX_COARSE : SCULPTURE_MAX_PX },
    uNominalHeight: { value: SCULPTURE_HEIGHT },
    uTime: { value: 0 },
    uSpawnTime: { value: 0 },
    uRiseEnabled: { value: prefersReducedMotion ? 0 : 1 },
    uMotion: { value: prefersReducedMotion ? 0 : 1 },
    uIntensity: { value: 1 },
  };
  return {
    shared,
    body: new THREE.ShaderMaterial({
      vertexShader: bodyVertex,
      fragmentShader: bodyFragment,
      uniforms: {
        ...shared,
        uSunDir: { value: SUN_DIRECTION.clone() },
        // the ship's hull: the same cool grey, the same ambient floor
        uBodyColor: { value: new THREE.Color('#b9c1cc') },
        uAmbient: { value: 0.2 },
        uBrightness: { value: SCULPTURE_BODY_BRIGHTNESS },
      },
    }),
    glow: new THREE.ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...shared,
        uGlowHeight: { value: SCULPTURE_HEIGHT * SCULPTURE_GLOW_HEIGHT },
        uGlowSize: { value: SCULPTURE_HEIGHT * SCULPTURE_GLOW_SIZE },
      },
    }),
    ring: new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { ...shared },
    }),
  };
}

function makeRig(dataset: NewsEvent[], materials: Materials): Rig {
  const total = dataset.length;
  const perCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const event of dataset) perCategory[event.category]++;

  const bodies = {} as Record<Category, THREE.InstancedMesh>;
  const bodyAttrs = {} as Record<Category, InstanceAttrs>;
  for (const category of CATEGORIES) {
    const geometry = getSculptureGeometry(category).clone();
    bodyAttrs[category] = makeInstanceAttrs(geometry, perCategory[category]);
    const mesh = new THREE.InstancedMesh(geometry, materials.body, perCategory[category]);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.name = `sculptures-${category}`;
    bodies[category] = mesh;
  }

  const glowGeometry = new THREE.PlaneGeometry(1, 1);
  const glowAttrs = makeInstanceAttrs(glowGeometry, total);
  const glow = new THREE.InstancedMesh(glowGeometry, materials.glow, total);
  glow.frustumCulled = false;
  glow.renderOrder = 1;
  glow.name = 'sculptures-glow';

  const ringGeometry = new THREE.RingGeometry(0.55, 1, 20);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringAttrs = makeInstanceAttrs(ringGeometry, total);
  const ring = new THREE.InstancedMesh(ringGeometry, materials.ring, total);
  ring.frustumCulled = false;
  ring.renderOrder = 1;
  ring.count = 0;
  ring.visible = false;
  ring.name = 'sculptures-ring';

  // A fatter target under a finger. Closed, unlike MarkerHitTarget's open
  // cylinder: a sculpture is short and wide, and the story you're looking
  // straight down at is exactly the one whose walls a ray never crosses.
  const touch = coarsePointer ? 1.6 : 1;
  const hitGeometry = new THREE.CylinderGeometry(
    0.45 * SCULPTURE_HEIGHT * touch,
    0.6 * SCULPTURE_HEIGHT * touch,
    SCULPTURE_HEIGHT,
    6,
    1,
  );
  hitGeometry.translate(0, SCULPTURE_HEIGHT / 2, 0);
  const hit = new THREE.InstancedMesh(hitGeometry, new THREE.MeshBasicMaterial(), total);
  hit.frustumCulled = false;
  hit.visible = false;
  hit.name = 'sculptures-hit';

  return { bodies, bodyAttrs, glow, glowAttrs, ring, ringAttrs, hit, spawnPending: true };
}

function disposeRig(rig: Rig) {
  for (const mesh of Object.values(rig.bodies)) {
    mesh.geometry.dispose();
    mesh.dispose();
  }
  for (const mesh of [rig.glow, rig.ring, rig.hit]) {
    mesh.geometry.dispose();
    mesh.dispose();
  }
  (rig.hit.material as THREE.Material).dispose();
}

const scratchMatrix = new THREE.Matrix4();
const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();

/** Fill the rig's buffers from the visible list; allocation already happened in makeRig. */
function writeLayout(rig: Rig, events: NewsEvent[], now: number): Layout {
  const n = events.length;
  const layout: Layout = {
    flat: events,
    idToIndex: new Map(),
    basePos: new Float32Array(n * 3),
    baseQuat: new Float32Array(n * 4),
    sevScale: new Float32Array(n),
    bodyIndex: new Int32Array(n),
    ringIndex: new Int32Array(n),
    boost: new Float32Array(n),
    fresh: [],
  };
  const localCount = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let ringCount = 0;

  for (let i = 0; i < n; i++) {
    const event = events[i];
    layout.idToIndex.set(event.id, i);
    const clock = freshnessClock(event);
    layout.fresh.push(clock);
    const fresh = clock(now);

    const { position, quaternion } = surfaceFrame(event.lat, event.lon, GLOBE_RADIUS + SCULPTURE_BASE_LIFT);
    const scale = sculptureScale(event.severity);
    position.toArray(layout.basePos, i * 3);
    quaternion.toArray(layout.baseQuat, i * 4);
    layout.sevScale[i] = scale;
    scratchMatrix.compose(position, quaternion, scratchScale.setScalar(scale));
    scratchColor.set(beamColor(event));

    const local = localCount[event.category]++;
    layout.bodyIndex[i] = local;
    rig.bodies[event.category].setMatrixAt(local, scratchMatrix);
    writeInstance(rig.bodyAttrs[event.category], local, event, scratchColor, fresh);

    rig.glow.setMatrixAt(i, scratchMatrix);
    writeInstance(rig.glowAttrs, i, event, scratchColor, fresh);

    // the hit matrix is rescaled by the frame loop to match the clamp
    rig.hit.setMatrixAt(i, scratchMatrix);

    if (event.isBreaking) {
      layout.ringIndex[i] = ringCount;
      rig.ring.setMatrixAt(ringCount, scratchMatrix);
      writeInstance(rig.ringAttrs, ringCount, event, scratchColor, fresh);
      ringCount++;
    } else {
      layout.ringIndex[i] = -1;
    }
  }

  for (const category of CATEGORIES) {
    const mesh = rig.bodies[category];
    mesh.count = localCount[category];
    mesh.visible = mesh.count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    touchAll(rig.bodyAttrs[category]);
  }
  rig.glow.count = n;
  rig.glow.visible = n > 0;
  rig.glow.instanceMatrix.needsUpdate = true;
  touchAll(rig.glowAttrs);
  rig.ring.count = ringCount;
  rig.ring.visible = ringCount > 0;
  rig.ring.instanceMatrix.needsUpdate = true;
  touchAll(rig.ringAttrs);
  rig.hit.count = n;
  rig.hit.instanceMatrix.needsUpdate = true;
  rig.hit.computeBoundingSphere();

  return layout;
}

/** The clamp the shader applies, for keeping the hit volumes the drawn size. */
function clampFactor(distance: number, tanHalfFov: number, viewportHeight: number, maxPx: number): number {
  const worldPerPx = (2 * distance * tanHalfFov) / viewportHeight;
  const naturalPx = SCULPTURE_HEIGHT / worldPerPx;
  return Math.min(Math.max(naturalPx, SCULPTURE_MIN_PX), maxPx) / naturalPx;
}

export function Sculptures() {
  const theme = useTheme();
  const dataset = useGlobeStore((s) => s.dataset);
  const events = useVisibleEvents();
  const hoveredId = useGlobeStore((s) => s.hovered?.id ?? null);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const setHovered = useGlobeStore((s) => s.setHovered);

  const materials = useMemo(makeMaterials, []);
  useEffect(
    () => () => {
      materials.body.dispose();
      materials.glow.dispose();
      materials.ring.dispose();
    },
    [materials],
  );

  // additive on dark themes, normal on light ones — the same rule as beams
  useEffect(() => {
    materials.glow.blending = theme.blipAdditive ? THREE.AdditiveBlending : THREE.NormalBlending;
    materials.glow.needsUpdate = true;
    materials.body.uniforms.uBrightness.value = SCULPTURE_BODY_BRIGHTNESS * theme.starBrightness;
    materials.shared.uIntensity.value = theme.beamIntensity;
  }, [materials, theme]);

  // capacities follow the unfiltered dataset, so hiding and showing a category
  // is a buffer write rather than an allocation
  const allEvents = dataset?.events ?? EMPTY_EVENTS;
  const rig = useMemo(() => makeRig(allEvents, materials), [allEvents, materials]);
  useEffect(() => () => disposeRig(rig), [rig]);

  const layoutRef = useRef<Layout>(EMPTY_LAYOUT);
  const eventsRef = useRef<NewsEvent[]>([]);
  const pointerIndexRef = useRef(-1);
  const hitDistanceRef = useRef(0);
  const freshAtRef = useRef(0);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  hoveredRef.current = hoveredId;
  selectedRef.current = selectedId;

  useEffect(() => {
    const now = Date.now();
    layoutRef.current = writeLayout(rig, events, now);
    eventsRef.current = events;
    freshAtRef.current = now;
    hitDistanceRef.current = 0; // force a hit rescale on the next frame
    // the story under the pointer may just have been filtered away
    if (pointerIndexRef.current >= 0) {
      pointerIndexRef.current = -1;
      document.body.style.cursor = 'auto';
      setHovered(null);
    }
  }, [rig, events, setHovered]);

  const handlers = useInstancedMarkerPointer(eventsRef, pointerIndexRef);

  useFrame((state, delta) => {
    const layout = layoutRef.current;
    const shared = materials.shared;
    const t = prefersReducedMotion ? 0 : state.clock.elapsedTime;
    if (rig.spawnPending) {
      rig.spawnPending = false;
      shared.uSpawnTime.value = t;
    }
    shared.uTime.value = t;

    const camera = state.camera as THREE.PerspectiveCamera;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    if (shared.uTanHalfFov.value !== tanHalfFov) shared.uTanHalfFov.value = tanHalfFov;
    if (shared.uViewportHeight.value !== state.size.height) {
      shared.uViewportHeight.value = state.size.height;
      hitDistanceRef.current = 0;
    }

    // hover and selection, from the globe or the rail, ease the boost
    const n = layout.flat.length;
    const hoveredIdx = hoveredRef.current ? (layout.idToIndex.get(hoveredRef.current) ?? -1) : -1;
    const selectedIdx = selectedRef.current ? (layout.idToIndex.get(selectedRef.current) ?? -1) : -1;
    const pointerIdx = pointerIndexRef.current;
    const ease = Math.min(delta * 8, 1);
    let glowDirty = false;
    let ringDirty = false;
    const bodyDirty = new Set<Category>();
    for (let i = 0; i < n; i++) {
      const target = i === pointerIdx || i === hoveredIdx || i === selectedIdx ? 1 : 0;
      const b = layout.boost[i];
      if (Math.abs(target - b) < 1e-4) continue;
      const next = b + (target - b) * ease;
      layout.boost[i] = next;
      const event = layout.flat[i];
      rig.bodyAttrs[event.category].aBoost.setX(layout.bodyIndex[i], next);
      bodyDirty.add(event.category);
      rig.glowAttrs.aBoost.setX(i, next);
      glowDirty = true;
      if (layout.ringIndex[i] >= 0) {
        rig.ringAttrs.aBoost.setX(layout.ringIndex[i], next);
        ringDirty = true;
      }
    }
    for (const category of bodyDirty) rig.bodyAttrs[category].aBoost.needsUpdate = true;
    if (glowDirty) rig.glowAttrs.aBoost.needsUpdate = true;
    if (ringDirty) rig.ringAttrs.aBoost.needsUpdate = true;

    // freshness decays over hours; refreshing it twice a minute is plenty
    const now = Date.now();
    if (now - freshAtRef.current > 30_000) {
      freshAtRef.current = now;
      for (let i = 0; i < n; i++) {
        const fresh = layout.fresh[i](now);
        const event = layout.flat[i];
        rig.bodyAttrs[event.category].aFresh.setX(layout.bodyIndex[i], fresh);
        rig.glowAttrs.aFresh.setX(i, fresh);
        if (layout.ringIndex[i] >= 0) rig.ringAttrs.aFresh.setX(layout.ringIndex[i], fresh);
      }
      for (const category of CATEGORIES) rig.bodyAttrs[category].aFresh.needsUpdate = true;
      rig.glowAttrs.aFresh.needsUpdate = true;
      rig.ringAttrs.aFresh.needsUpdate = true;
    }

    // the hit volumes don't pass through the vertex shader, so they follow the
    // clamp from here — whenever the camera has moved enough to matter
    const camDistance = camera.position.length();
    if (Math.abs(camDistance - hitDistanceRef.current) > hitDistanceRef.current * 0.015) {
      hitDistanceRef.current = camDistance;
      const maxPx = shared.uMaxPx.value as number;
      for (let i = 0; i < n; i++) {
        scratchPos.fromArray(layout.basePos, i * 3);
        scratchQuat.fromArray(layout.baseQuat, i * 4);
        const k = clampFactor(camera.position.distanceTo(scratchPos), tanHalfFov, state.size.height, maxPx);
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale.setScalar(layout.sevScale[i] * k));
        rig.hit.setMatrixAt(i, scratchMatrix);
      }
      if (n > 0) {
        rig.hit.instanceMatrix.needsUpdate = true;
        rig.hit.computeBoundingSphere();
      }
    }
  });

  return (
    <group name="sculptures">
      {CATEGORIES.map((category) => (
        <primitive key={category} object={rig.bodies[category]} />
      ))}
      <primitive object={rig.glow} />
      <primitive object={rig.ring} />
      {/* never drawn, always raycast: the pointer target for every story */}
      <primitive object={rig.hit} visible={false} {...handlers} />
    </group>
  );
}

