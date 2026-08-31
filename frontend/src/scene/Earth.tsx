import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../lib/geo';
import { useCountryTint, useTheme } from '../store';

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
  uniform sampler2D tintMap;
  uniform float uTintOpacity;
  uniform vec3 sunDir;
  uniform int uMode;          // 0 satellite, 1 minimal, 2 light, 3 night, 4 grid
  uniform vec3 uRimColor;
  uniform float uRimStrength;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  float gridLine(float coord, float divisions, float width) {
    float d = abs(fract(coord * divisions) - 0.5);
    return smoothstep(width, 0.0, 0.5 - d);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float waterMask = texture2D(waterMap, vUv).r;   // 1 = ocean
    float land = 1.0 - waterMask;
    // soft key light for non-satellite modes so the sphere keeps its volume
    float shade = 0.72 + 0.28 * clamp(dot(normal, sunDir) * 0.5 + 0.5, 0.0, 1.0);

    vec3 color;

    if (uMode == 0) {
      // — satellite: day/night blend, city lights, ocean specular —
      float sunDot = dot(normal, sunDir);
      float dayAmount = smoothstep(-0.12, 0.25, sunDot);
      vec3 dayColor = texture2D(dayMap, vUv).rgb * vec3(0.85, 0.93, 1.05);
      vec3 nightColor = texture2D(nightMap, vUv).rgb;
      vec3 cityGlow = pow(nightColor, vec3(1.4)) * vec3(1.4, 1.1, 0.65) * 2.2;
      vec3 nightSide = cityGlow + nightColor * 0.08;
      color = mix(nightSide, dayColor * (0.35 + 0.85 * clamp(sunDot, 0.0, 1.0)), dayAmount);
      vec3 halfDir = normalize(sunDir + viewDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 48.0) * waterMask * dayAmount;
      color += spec * vec3(0.5, 0.7, 0.9) * 0.6;
    } else if (uMode == 1) {
      // — minimal: flat two-tone, dark ocean / slate land —
      color = mix(vec3(0.14, 0.21, 0.31), vec3(0.043, 0.078, 0.125), waterMask) * shade;
    } else if (uMode == 2) {
      // — light: clean platform look, slate ocean / near-white land —
      color = mix(vec3(0.96, 0.968, 0.975), vec3(0.62, 0.695, 0.79), waterMask) * (0.9 + 0.1 * shade);
    } else if (uMode == 3) {
      // — night: city lights only —
      vec3 nightColor = texture2D(nightMap, vUv).rgb;
      vec3 cityGlow = pow(nightColor, vec3(1.3)) * vec3(1.5, 1.2, 0.7) * 2.6;
      vec3 base = mix(vec3(0.05, 0.075, 0.115), vec3(0.016, 0.027, 0.05), waterMask);
      color = base * shade + cityGlow;
    } else {
      // — grid: dark holo sphere with graticule + faint land plates —
      vec3 base = mix(vec3(0.05, 0.09, 0.14), vec3(0.012, 0.024, 0.045), waterMask) * shade;
      float grat = max(gridLine(vUv.x, 24.0, 0.012), gridLine(vUv.y, 12.0, 0.012));
      color = base + grat * vec3(0.11, 0.24, 0.38);
    }

    // country tint: dominant-category wash over countries carrying events
    vec4 tint = texture2D(tintMap, vUv);
    color = mix(color, tint.rgb, tint.a * uTintOpacity);

    // subtle inner rim, sun-modulated: a crescent highlight on the lit limb
    // that fades to almost nothing on the dark limb — ties the globe to the sun
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    float litSide = 0.2 + 0.8 * smoothstep(-0.35, 0.55, dot(normal, sunDir));
    color += fresnel * uRimColor * uRimStrength * litSide;
    // warm kiss right at the lit limb
    color += fresnel * vec3(1.0, 0.85, 0.6) * 0.10 * smoothstep(0.25, 0.9, dot(normal, sunDir));

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** 1x1 transparent fallback so the shader always has a valid tint sampler. */
const EMPTY_TINT = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  texture.needsUpdate = true;
  return texture;
})();

export function Earth() {
  const theme = useTheme();
  const tint = useCountryTint();
  const [dayMap, nightMap, waterMap] = useTexture([
    `${import.meta.env.BASE_URL}textures/earth-day.jpg`,
    `${import.meta.env.BASE_URL}textures/earth-night.jpg`,
    `${import.meta.env.BASE_URL}textures/earth-water.png`,
  ]);

  const material = useMemo(() => {
    for (const map of [dayMap, nightMap]) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
    waterMap.colorSpace = THREE.NoColorSpace;
    waterMap.anisotropy = 8;
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        waterMap: { value: waterMap },
        tintMap: { value: EMPTY_TINT },
        uTintOpacity: { value: 0 },
        sunDir: { value: SUN_DIRECTION.clone() },
        uMode: { value: 0 },
        uRimColor: { value: new THREE.Color('#3a7bd5') },
        uRimStrength: { value: 0.22 },
      },
    });
  }, [dayMap, nightMap, waterMap]);

  useEffect(() => {
    material.uniforms.tintMap.value = tint ?? EMPTY_TINT;
    material.uniforms.uTintOpacity.value = tint ? theme.tintOpacity : 0;
  }, [material, tint, theme]);

  useEffect(() => {
    material.uniforms.uMode.value = theme.mode;
    (material.uniforms.uRimColor.value as THREE.Color).set(theme.rimColor);
    material.uniforms.uRimStrength.value = theme.rimStrength;
  }, [material, theme]);

  // The planet mesh stays fixed (blips/borders are registered to lat/lon);
  // idle motion comes from OrbitControls auto-rotate instead.
  return (
    <mesh material={material} name="earth">
      <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
    </mesh>
  );
}
