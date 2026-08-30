import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { CATEGORY_COLORS } from '../../../shared/news';
import { latLonToVec3, GLOBE_RADIUS } from '../lib/geo';
import { CATEGORY_PATTERN } from '../lib/signatures';
import { useGlobeStore, useTheme, useVisibleEvents } from '../store';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uRate;      // pulse rate (severity-scaled)
  uniform float uBreaking;  // 1.0 for breaking events
  uniform float uBoost;     // hover/selection emphasis
  uniform float uAlphaBoost; // >1 on light surfaces (normal blending needs denser alpha)
  uniform int uPattern;     // category signature (see lib/signatures.ts)
  varying vec2 vUv;

  float sdBox(vec2 p, vec2 b) {
    vec2 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }

  // distance from p to the boundary of the expanding signature shape of size s
  float shapeDist(vec2 p, float s, float t) {
    float r = length(p);
    if (uPattern == 3) return abs(abs(p.x) + abs(p.y) - s);          // economy: diamond
    if (uPattern == 4) {                                              // health: plus
      float w = s * 0.4;
      return abs(min(sdBox(p, vec2(s * 0.92, w)), sdBox(p, vec2(w, s * 0.92))));
    }
    if (uPattern == 5) {                                              // science: hexagon
      vec2 q = abs(p);
      return abs(max(q.x * 0.866025 + q.y * 0.5, q.y) - s * 0.92);
    }
    if (uPattern == 6) {                                              // climate: ripple
      float a = atan(p.y, p.x);
      return abs(r - s * (1.0 + 0.09 * sin(a * 6.0 + t * 2.0)));
    }
    return abs(r - s);                                                // circle (default)
  }

  float ring(vec2 p, float phase, float width, float t) {
    float d = shapeDist(p, phase * 0.48, t);
    float a = smoothstep(width, 0.0, d);
    return a * (1.0 - phase) * (1.0 - phase);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p);
    if (r > 0.5) discard;

    float width = 0.014 + 0.01 * uBoost;
    float alpha = 0.0;
    // three staggered expanding signature rings
    for (int k = 0; k < 3; k++) {
      float phase = fract(uTime * uRate + float(k) / 3.0);
      alpha += ring(p, phase, width, uTime);
      // disaster: each pulse is a double shockwave — a trailing twin ring
      if (uPattern == 1) alpha += ring(p, fract(phase + 0.905), width, uTime) * 0.65;
    }

    // society: segmented ring — angular dashes (slowly rotating)
    if (uPattern == 7) {
      float a = atan(p.y, p.x);
      float dash = step(0.32, fract(a * 1.90986 + uTime * 0.12));
      alpha *= mix(0.12, 1.0, dash);
    }

    // conflict: four radial spikes over the rings
    if (uPattern == 0) {
      float axis = min(abs(p.x), abs(p.y));
      float spike = smoothstep(0.013, 0.0, axis) * smoothstep(0.46, 0.08, r);
      alpha += spike * (0.5 + 0.35 * sin(uTime * 3.0));
    }

    // politics: small satellite dot orbiting the core
    if (uPattern == 2) {
      vec2 orbit = vec2(cos(uTime * 1.5), sin(uTime * 1.5)) * 0.3;
      alpha += smoothstep(0.05, 0.0, distance(p, orbit));
    }

    // glowing core
    float core = smoothstep(0.055, 0.0, r) * (0.85 + 0.5 * sin(uTime * 3.0));
    alpha += core;

    vec3 color = uColor;

    // breaking: fast white strobe ring on top
    if (uBreaking > 0.5) {
      float strobePhase = fract(uTime * 1.6);
      float strobe = ring(p, strobePhase, 0.02, uTime);
      float blink = step(0.5, fract(uTime * 2.5));
      color = mix(color, vec3(1.0), strobe * 0.9 + blink * core * 0.4);
      alpha += strobe * 1.2;
    }

    alpha *= (0.9 + uBoost * 0.8) * uAlphaBoost;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(color * (1.0 + uBoost * 0.6), min(alpha, 1.0));
  }
`;

const FORWARD = new THREE.Vector3(0, 0, 1);

function Blip({ event }: { event: NewsEvent }) {
  const theme = useTheme();
  const setHovered = useGlobeStore((s) => s.setHovered);
  const select = useGlobeStore((s) => s.select);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const boostRef = useRef(0);
  const hoveredRef = useRef(false);

  const { position, quaternion, size } = useMemo(() => {
    const pos = latLonToVec3(event.lat, event.lon, GLOBE_RADIUS * 1.006);
    const quat = new THREE.Quaternion().setFromUnitVectors(FORWARD, pos.clone().normalize());
    return { position: pos, quaternion: quat, size: 0.11 + event.severity * 0.05 };
  }, [event.lat, event.lon, event.severity]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        // additive glow washes out on the light theme's near-white surface
        blending: theme.blipAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uColor: { value: new THREE.Color(CATEGORY_COLORS[event.category]) },
          uTime: { value: Math.random() * 20 },
          uRate: { value: 0.28 + event.severity * 0.16 },
          uBreaking: { value: event.isBreaking ? 1 : 0 },
          uBoost: { value: 0 },
          uAlphaBoost: { value: theme.blipAdditive ? 1 : 1.9 },
          uPattern: { value: CATEGORY_PATTERN[event.category] },
        },
      }),
    [event.category, event.severity, event.isBreaking, theme.blipAdditive],
  );

  useFrame((state, delta) => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    const target = hoveredRef.current || selectedId === event.id ? 1 : 0;
    boostRef.current += (target - boostRef.current) * Math.min(delta * 8, 1);
    mat.uniforms.uBoost.value = boostRef.current;
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoveredRef.current = true;
    document.body.style.cursor = 'pointer';
    setHovered({ id: event.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (hoveredRef.current) {
      setHovered({ id: event.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
  };
  const onOut = () => {
    hoveredRef.current = false;
    document.body.style.cursor = 'auto';
    setHovered(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(event.id);
  };

  return (
    <group position={position} quaternion={quaternion}>
      <mesh
        material={material}
        ref={(m: THREE.Mesh | null) => {
          if (m) materialRef.current = m.material as THREE.ShaderMaterial;
        }}
        scale={[size, size, 1]}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
      {/* invisible enlarged hit target */}
      <mesh
        onPointerOver={onOver}
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
        position={[0, 0, 0.01]}
      >
        <sphereGeometry args={[0.028 + event.severity * 0.007, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Blips() {
  const events = useVisibleEvents();
  return (
    <group name="blips">
      {events.map((event) => (
        <Blip key={event.id} event={event} />
      ))}
    </group>
  );
}
