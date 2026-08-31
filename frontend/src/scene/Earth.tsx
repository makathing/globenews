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
  uniform sampler2D topoMap;
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
      // — Obsidian: matte near-black planet, land lifted a touch —
      color = mix(vec3(0.105, 0.115, 0.132), vec3(0.019, 0.024, 0.032), waterMask) * shade;
    } else if (uMode == 1) {
      // — Halftone: land rendered as a dot matrix —
      vec2 grid = vUv * vec2(340.0, 170.0);
      vec2 cell = fract(grid) - 0.5;
      // shrink dots toward the coast so edges feather instead of clipping
      float density = smoothstep(0.25, 0.75, land);
      float dotMask = smoothstep(0.42, 0.16, length(cell)) * density;
      color = vec3(0.014, 0.02, 0.03) + dotMask * vec3(0.52, 0.60, 0.70) * shade;
    } else if (uMode == 2) {
      // — Slate: the real satellite imagery, desaturated to greys —
      vec3 day = texture2D(dayMap, vUv).rgb;
      float luma = dot(day, vec3(0.299, 0.587, 0.114));
      color = vec3(pow(luma, 1.15)) * (0.42 + 0.58 * shade);
    } else if (uMode == 3) {
      // — Blueprint: deep navy with a cyan graticule over land plates —
      vec3 base = mix(vec3(0.055, 0.085, 0.14), vec3(0.014, 0.028, 0.055), waterMask);
      float grat = max(gridLine(vUv.x, 24.0, 0.010), gridLine(vUv.y, 12.0, 0.010));
      color = base * shade + grat * vec3(0.08, 0.17, 0.26);
    } else if (uMode == 4) {
      // — Atlas: the classic globe, flat ocean blue against land green —
      vec3 ocean = vec3(0.106, 0.310, 0.490);
      vec3 landColor = vec3(0.247, 0.490, 0.298);
      // lift the shelf where the mask feathers along coastlines
      float shelf = smoothstep(0.35, 0.75, waterMask) * (1.0 - smoothstep(0.75, 1.0, waterMask));
      color = mix(landColor, ocean, waterMask) + shelf * vec3(0.05, 0.09, 0.11);
      color *= 0.72 + 0.38 * shade;
    } else {
      // — Relief: grayscale terrain shading from the topography map —
      float elev = texture2D(topoMap, vUv).r;
      // cheap slope estimate for a sense of ridges
      float dx = texture2D(topoMap, vUv + vec2(0.0016, 0.0)).r - elev;
      float dy = texture2D(topoMap, vUv + vec2(0.0, 0.0016)).r - elev;
      float relief = clamp(0.5 + (dx + dy) * 7.0, 0.0, 1.0);
      vec3 terrain = mix(vec3(0.10, 0.105, 0.115), vec3(0.60, 0.60, 0.605), elev * 0.85 + relief * 0.35);
      color = mix(terrain, vec3(0.028, 0.036, 0.05), waterMask) * shade;
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
  const [dayMap, nightMap, waterMap, topoMap] = useTexture([
    `${import.meta.env.BASE_URL}textures/earth-day.jpg`,
    `${import.meta.env.BASE_URL}textures/earth-night.jpg`,
    `${import.meta.env.BASE_URL}textures/earth-water.png`,
    `${import.meta.env.BASE_URL}textures/earth-topology.png`,
  ]);

  const material = useMemo(() => {
    for (const map of [dayMap, nightMap]) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
    for (const map of [waterMap, topoMap]) {
      map.colorSpace = THREE.NoColorSpace;
      map.anisotropy = 8;
    }
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        waterMap: { value: waterMap },
        topoMap: { value: topoMap },
        tintMap: { value: EMPTY_TINT },
        uTintOpacity: { value: 0 },
        sunDir: { value: SUN_DIRECTION.clone() },
        uMode: { value: 0 },
        uRimColor: { value: new THREE.Color('#3a7bd5') },
        uRimStrength: { value: 0.22 },
      },
    });
  }, [dayMap, nightMap, waterMap, topoMap]);

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
