import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { latLonToVec3, GLOBE_RADIUS } from '../lib/geo';
import { beamColor, beamHeight, beamRate, beamWidth, freshness } from '../lib/beams';
import { CATEGORY_PATTERN } from '../lib/signatures';
import { useGlobeStore, useTheme, useVisibleEvents } from '../store';

/**
 * Vertical light shafts rising from each event's location. Height and colour
 * both encode severity, brightness encodes freshness; category shows up only
 * as a shaft pattern. Beams tall enough to clear the horizon stay visible over
 * the limb, which is how far-side events announce themselves.
 *
 * Everything here is tuned for two viewpoints at once. From orbit a beam is a
 * few pixels wide and needs glow to exist at all; flown in, that same glow is
 * a smear. `uProximity` is how the shaders tell the two apart.
 */

/* — shaft: a quad standing on the surface, billboarded about its own axis — */
const shaftVertex = /* glsl */ `
  uniform float uHeight;
  uniform float uWidth;
  uniform float uBoost;
  varying vec2 vUv;

  void main() {
    vUv = uv;

    // beam axis (surface normal) in view space
    vec3 axis = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
    vec4 baseView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // cylindrical billboard: side vector perpendicular to both the axis and
    // the view direction, so the shaft always presents its full width
    vec3 toEye = normalize(-baseView.xyz);
    vec3 side = cross(axis, toEye);
    // a beam pointing straight at the camera has no well-defined side vector —
    // fall back to any perpendicular so the quad never collapses to NaN
    side = length(side) < 1e-4 ? normalize(cross(axis, vec3(0.0, 0.0, 1.0))) : normalize(side);

    float halfWidth = uWidth * (1.0 + uBoost * 0.55);
    // gentle taper so the shaft reads as volume, not a needle
    float taper = mix(1.0, 0.72, uv.y);
    vec3 offset = side * (position.x * 2.0 * halfWidth * taper) + axis * (uv.y * uHeight);

    gl_Position = projectionMatrix * (baseView + vec4(offset, 0.0));
  }
`;

const shaftFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uRate;
  uniform float uBreaking;
  uniform float uBoost;
  uniform float uFresh;
  uniform float uIntensity;
  uniform float uProximity;   // 0 = orbital distance, 1 = right up against it
  uniform float uAxisView;    // |dot(beam axis, view dir)|: 1 = looking down it
  uniform int uPattern;
  varying vec2 vUv;

  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;   // 0 at core, 1 at edge
    float y = vUv.y;                     // 0 at base, 1 at tip
    float near = uProximity;

    // Volumetric cross-section. From orbit a beam is a few pixels wide, so it
    // needs a wide haze to register at all; up close that same haze is a white
    // smear across the screen. Trade haze for a tighter, better-defined core
    // as you approach — glow at range, structure in the near field.
    float core = smoothstep(1.0, 0.0, x);
    float haze = pow(core, 1.35) * mix(0.55, 0.16, near);
    float body = haze + pow(core, mix(5.0, 9.0, near)) * 0.75;
    // a crisp edge rail, invisible from orbit, that gives the shaft a
    // silhouette instead of a gradient once you're close enough to see it
    body += smoothstep(0.86, 0.66, x) * smoothstep(0.52, 0.72, x) * near * 0.5;
    // conflict beams read as a split/doubled shaft
    if (uPattern == 0) body *= 0.7 + 0.3 * smoothstep(0.1, 0.4, x);

    // vertical fade: dense at the base, fully dissolved before the tip
    float vertical = pow(1.0 - y, 1.25) * smoothstep(1.0, 0.72, y);

    float alpha = body * vertical;

    // energy pulse travelling up the shaft
    float pulsePhase = fract(uTime * uRate * (0.75 + 0.35 * uFresh) - y);
    float pulse = smoothstep(0.22, 0.0, pulsePhase) * (1.0 - y * 0.4);
    alpha += pulse * core * 0.55;
    // disaster: a trailing twin pulse
    if (uPattern == 1) {
      float twin = smoothstep(0.1, 0.0, fract(pulsePhase + 0.86));
      alpha += twin * core * 0.4 * (1.0 - y * 0.35);
    }

    // A soft swell near the top so tall beams still terminate visibly — a
    // distance affordance. Up close it is just a blob over the shaft, so it
    // fades out exactly as the shaft itself becomes legible.
    float cap = pow(max(1.0 - length(vec2(x * 1.1, (y - 0.62) * 2.6)), 0.0), 2.6);
    cap *= 1.0 - near;
    alpha += cap * 0.22 * (1.0 + uBoost);

    vec3 color = uColor;
    if (uBreaking > 0.5) {
      // white-hot core, faster strobe
      float strobe = 0.5 + 0.5 * sin(uTime * 7.0);
      color = mix(color, vec3(1.0), core * (0.35 + 0.35 * strobe));
      alpha *= 1.15;
    }
    color = mix(color, vec3(1.0), max(pulse * 0.45, cap * 0.2));

    alpha *= (0.55 + 0.45 * uFresh) * (0.85 + uBoost * 0.9) * uIntensity;
    // Additive blending clips at 1.0, and a clipped core is a flat white
    // region with no gradient left in it — which is what a near beam was.
    // Pull the whole shaft down as you approach so it lands under saturation.
    alpha *= mix(1.0, 0.55, near);
    // Selecting a story flies the camera onto the event's own normal, so you
    // end up sighting straight down the shaft, where a vertical beam has no
    // shape to show. Yield instead of drawing a bright blob — the pool below
    // takes over as the marker.
    alpha *= 1.0 - smoothstep(0.72, 0.97, uAxisView) * 0.75;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * (1.0 + uBoost * 0.5), min(alpha, 1.0));
  }
`;

/* — ground pool: a glow disc lying flat on the surface at the beam's base — */
const poolFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uBoost;
  uniform float uFresh;
  uniform float uIntensity;
  uniform float uBreaking;
  uniform float uProximity;
  uniform float uAxisView;
  varying vec2 vUv;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;

    // soft pool of light, with only a whisper of a rim so clustered events
    // don't turn into a pile of hard rings
    float glow = pow(1.0 - r, 3.2) * 0.5;
    float rim = smoothstep(0.16, 0.0, abs(r - 0.66)) * 0.16;
    float breathe = 0.85 + 0.15 * sin(uTime * 1.6);

    // The pool locates a beam you're looking at from orbit. Flown in, it is a
    // ring the size of a state drawn over the map — so it recedes on approach,
    // rim first, leaving the shaft to speak for itself.
    float near = uProximity;
    // ...unless you are looking straight down at it, where the shaft has
    // nothing to say and this ring is the only thing marking the spot.
    float overhead = smoothstep(0.6, 0.92, uAxisView);
    rim *= mix(1.0 - near, 1.0, overhead);
    glow *= mix(mix(1.0, 0.45, near), 1.0, overhead);

    float alpha = (glow + rim * breathe) * (0.5 + 0.5 * uFresh);
    alpha *= (0.8 + uBoost * 1.1) * uIntensity;
    vec3 color = mix(uColor, vec3(1.0), uBreaking * 0.25);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, min(alpha, 1.0));
  }
`;

const passthroughVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const UP = new THREE.Vector3(0, 1, 0);
/** Frame-local scratch: reused by every beam within a single useFrame pass. */
const toEye = new THREE.Vector3();

function Beam({ event }: { event: NewsEvent }) {
  const theme = useTheme();
  const setHovered = useGlobeStore((s) => s.setHovered);
  const select = useGlobeStore((s) => s.select);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const hoveredId = useGlobeStore((s) => s.hovered?.id ?? null);

  const boostRef = useRef(0);
  const pointerInsideRef = useRef(false);
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);

  const height = beamHeight(event.severity);
  const width = beamWidth(event.severity);

  const { position, quaternion, axis } = useMemo(() => {
    const pos = latLonToVec3(event.lat, event.lon, GLOBE_RADIUS);
    // local +Y becomes the surface normal, which is also the beam's axis
    const normal = pos.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    return { position: pos, quaternion: quat, axis: normal };
  }, [event.lat, event.lon]);

  const { shaft, pool } = useMemo(() => {
    const color = new THREE.Color(beamColor(event));
    const shared = () => ({
      uColor: { value: color.clone() },
      uTime: { value: Math.random() * 30 },
      uBoost: { value: 0 },
      uFresh: { value: 1 },
      uIntensity: { value: 1 },
      uProximity: { value: 0 },
      uAxisView: { value: 0 },
      uBreaking: { value: event.isBreaking ? 1 : 0 },
    });
    const common = {
      transparent: true,
      depthWrite: false,
      // depthTest against the Earth keeps far-side beams correctly occluded —
      // only the tall ones crest the limb, which is the discoverability cue
      depthTest: true,
      blending: theme.blipAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
    };
    return {
      shaft: new THREE.ShaderMaterial({
        ...common,
        vertexShader: shaftVertex,
        fragmentShader: shaftFragment,
        side: THREE.DoubleSide,
        uniforms: {
          ...shared(),
          uHeight: { value: height },
          uWidth: { value: width },
          uRate: { value: beamRate(event.severity) },
          uPattern: { value: CATEGORY_PATTERN[event.category] },
        },
      }),
      pool: new THREE.ShaderMaterial({
        ...common,
        vertexShader: passthroughVertex,
        fragmentShader: poolFragment,
        uniforms: shared(),
      }),
    };
  }, [event.category, event.severity, event.isBreaking, theme.blipAdditive, height, width]);

  materialsRef.current = [shaft, pool];

  useFrame((state, delta) => {
    const active = pointerInsideRef.current || hoveredId === event.id || selectedId === event.id;
    boostRef.current += ((active ? 1 : 0) - boostRef.current) * Math.min(delta * 8, 1);
    const fresh = freshness(event);
    // `position` is the beam's base in world space — the group it lives in
    // sits at the origin — so this is the camera's true distance to the beam.
    // 1.9 is just inside OrbitControls' minDistance; 4.3 is the default
    // framing, where beams should look exactly as they always have.
    const distance = state.camera.position.distanceTo(position);
    const proximity = Math.min(Math.max(1 - (distance - 1.9) / (4.3 - 1.9), 0), 1);
    // how side-on the beam is: the base sits on the sphere, so its own
    // position (normalized) is also its axis
    toEye.subVectors(state.camera.position, position).normalize();
    const axisView = Math.abs(toEye.dot(axis));
    for (const material of materialsRef.current) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uBoost.value = boostRef.current;
      material.uniforms.uFresh.value = fresh;
      material.uniforms.uIntensity.value = theme.beamIntensity;
      material.uniforms.uProximity.value = proximity;
      material.uniforms.uAxisView.value = axisView;
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pointerInsideRef.current = true;
    document.body.style.cursor = 'pointer';
    setHovered({ id: event.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (pointerInsideRef.current) {
      setHovered({ id: event.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
  };
  const onOut = () => {
    pointerInsideRef.current = false;
    document.body.style.cursor = 'auto';
    setHovered(null);
  };
  // A touch fires pointerover but never pointerout, so on a phone the tooltip
  // pinned open over the globe until you tapped a different beam. Lifting the
  // finger is the "out" event that touch never sends.
  const onTouchRelease = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.pointerType !== 'mouse') onOut();
  };

  const poolSize = width * 5.2;

  return (
    <group position={position} quaternion={quaternion}>
      {/* shaft: unit quad, expanded to full size in the vertex shader */}
      <mesh material={shaft} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>

      {/* ground pool, lying flat on the surface */}
      <mesh material={pool} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[poolSize, poolSize]} />
      </mesh>

      {/* invisible hit cylinder matching the shaft */}
      <mesh
        position={[0, height / 2, 0]}
        onPointerOver={onOver}
        onPointerMove={onMove}
        onPointerOut={onOut}
        onPointerUp={onTouchRelease}
        onPointerCancel={onTouchRelease}
        onClick={(e) => {
          e.stopPropagation();
          select(event.id, { fromGlobe: true });
        }}
      >
        <cylinderGeometry args={[width * 2.6, width * 3.4, height, 6, 1, true]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Beams() {
  const events = useVisibleEvents();
  return (
    <group name="beams">
      {events.map((event) => (
        <Beam key={event.id} event={event} />
      ))}
    </group>
  );
}
