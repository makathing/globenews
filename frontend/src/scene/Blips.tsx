import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { CATEGORY_COLORS } from '../../../shared/news';
import { latLonToVec3, GLOBE_RADIUS } from '../lib/geo';
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
  varying vec2 vUv;

  float ring(float r, float phase, float width) {
    float ringR = phase * 0.48;
    float d = abs(r - ringR);
    float a = smoothstep(width, 0.0, d);
    return a * (1.0 - phase) * (1.0 - phase);
  }

  void main() {
    float r = length(vUv - 0.5);
    if (r > 0.5) discard;

    float alpha = 0.0;
    // three staggered expanding radar rings
    for (int k = 0; k < 3; k++) {
      float phase = fract(uTime * uRate + float(k) / 3.0);
      alpha += ring(r, phase, 0.014 + 0.01 * uBoost);
    }

    // glowing core
    float core = smoothstep(0.055, 0.0, r) * (0.85 + 0.5 * sin(uTime * 3.0));
    alpha += core;

    vec3 color = uColor;

    // breaking: fast white strobe ring on top
    if (uBreaking > 0.5) {
      float strobePhase = fract(uTime * 1.6);
      float strobe = ring(r, strobePhase, 0.02);
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
