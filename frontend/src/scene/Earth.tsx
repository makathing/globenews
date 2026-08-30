import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../lib/geo';

/** Fixed sun direction: keeps a dramatic terminator with glowing night-side cities in view. */
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

const fragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float sunDot = dot(normal, sunDir);
    float dayAmount = smoothstep(-0.12, 0.25, sunDot);

    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    // subtle cool grade so the day side sits in the scene's palette
    dayColor *= vec3(0.85, 0.93, 1.05);

    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    vec3 cityGlow = pow(nightColor, vec3(1.4)) * vec3(1.4, 1.1, 0.65) * 2.2;
    vec3 nightSide = cityGlow + nightColor * 0.08;

    vec3 color = mix(nightSide, dayColor * (0.35 + 0.85 * clamp(sunDot, 0.0, 1.0)), dayAmount);

    // ocean specular
    float waterMask = texture2D(waterMap, vUv).r;
    vec3 halfDir = normalize(sunDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 48.0) * waterMask * dayAmount;
    color += spec * vec3(0.5, 0.7, 0.9) * 0.6;

    // atmospheric rim (inner fresnel)
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.6);
    color += fresnel * vec3(0.22, 0.55, 1.0) * 0.55;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function Earth() {
  const [dayMap, nightMap, waterMap] = useTexture([
    `${import.meta.env.BASE_URL}textures/earth-day.jpg`,
    `${import.meta.env.BASE_URL}textures/earth-night.jpg`,
    `${import.meta.env.BASE_URL}textures/earth-water.png`,
  ]);

  const material = useMemo(() => {
    for (const map of [dayMap, nightMap, waterMap]) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
    waterMap.colorSpace = THREE.NoColorSpace;
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        waterMap: { value: waterMap },
        sunDir: { value: SUN_DIRECTION.clone() },
      },
    });
  }, [dayMap, nightMap, waterMap]);

  // The planet mesh stays fixed (blips/borders are registered to lat/lon);
  // idle motion comes from OrbitControls auto-rotate instead.
  return (
    <mesh material={material} name="earth">
      <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
    </mesh>
  );
}
