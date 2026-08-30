import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Earth } from './Earth';
import { Clouds } from './Clouds';
import { Atmosphere } from './Atmosphere';
import { CountryBorders } from './CountryBorders';
import { Starfield } from './Starfield';
import { Blips } from './Blips';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { useGlobeStore } from '../store';

export function SceneRoot() {
  const select = useGlobeStore((s) => s.select);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0.55, 0.55, 2.45], fov: 45, near: 0.1, far: 120 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => select(null)}
      style={{ position: 'absolute', inset: 0, background: '#010309' }}
    >
      <color attach="background" args={['#010309']} />
      <Starfield />
      <Suspense fallback={null}>
        <Earth />
        <Clouds />
      </Suspense>
      <Atmosphere />
      <CountryBorders />
      <Blips />
      <CameraRig />
      <Effects />
    </Canvas>
  );
}
