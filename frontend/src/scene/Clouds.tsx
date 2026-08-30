import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../lib/geo';
import { SUN_DIRECTION } from './Earth';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    float clouds = texture2D(cloudMap, vUv).r;
    float lit = smoothstep(-0.15, 0.3, dot(normalize(vNormal), sunDir));
    vec3 color = mix(vec3(0.06, 0.1, 0.18), vec3(0.9, 0.95, 1.0), lit);
    gl_FragColor = vec4(color, clouds * 0.55);
  }
`;

export function Clouds() {
  const cloudMap = useTexture(`${import.meta.env.BASE_URL}textures/clouds.png`);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          cloudMap: { value: cloudMap },
          sunDir: { value: SUN_DIRECTION.clone() },
        },
      }),
    [cloudMap],
  );

  const mesh = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta * 0.008;
  });

  return (
    <mesh ref={mesh} material={material}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.012, 64, 64]} />
    </mesh>
  );
}
