import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { CATEGORY_COLORS } from '../../../shared/news';
import { latLonToVec3, GLOBE_RADIUS } from '../lib/geo';
import { beamHeight, beamRate, beamWidth, freshness } from '../lib/beams';
import { CATEGORY_PATTERN } from '../lib/signatures';
import { useGlobeStore, useTheme, useVisibleEvents } from '../store';

/**
 * Vertical light shafts rising from each event's location. Height encodes
 * severity, colour encodes category, brightness encodes freshness. Beams tall
 * enough to clear the horizon stay visible over the limb, which is how far-side
 * events announce themselves.
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
  uniform int uPattern;
  varying vec2 vUv;

  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;   // 0 at core, 1 at edge
    float y = vUv.y;                     // 0 at base, 1 at tip

    // volumetric cross-section: a bright core inside a soft outer haze
    float core = smoothstep(1.0, 0.0, x);
    float body = pow(core, 1.35) * 0.55 + pow(core, 5.0) * 0.75;
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

    // a soft swell near the top so tall beams still terminate visibly
    float cap = pow(max(1.0 - length(vec2(x * 1.1, (y - 0.62) * 2.6)), 0.0), 2.6);
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
  varying vec2 vUv;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;

    // soft pool of light, with only a whisper of a rim so clustered events
    // don't turn into a pile of hard rings
    float glow = pow(1.0 - r, 3.2) * 0.5;
    float rim = smoothstep(0.16, 0.0, abs(r - 0.66)) * 0.16;
    float breathe = 0.85 + 0.15 * sin(uTime * 1.6);

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

  const { position, quaternion } = useMemo(() => {
    const pos = latLonToVec3(event.lat, event.lon, GLOBE_RADIUS);
    // local +Y becomes the surface normal
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, pos.clone().normalize());
    return { position: pos, quaternion: quat };
  }, [event.lat, event.lon]);

  const { shaft, pool } = useMemo(() => {
    const color = new THREE.Color(CATEGORY_COLORS[event.category]);
    const shared = () => ({
      uColor: { value: color.clone() },
      uTime: { value: Math.random() * 30 },
      uBoost: { value: 0 },
      uFresh: { value: 1 },
      uIntensity: { value: 1 },
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
    for (const material of materialsRef.current) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uBoost.value = boostRef.current;
      material.uniforms.uFresh.value = fresh;
      material.uniforms.uIntensity.value = theme.beamIntensity;
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
