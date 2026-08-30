import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Earth } from './Earth';
import { Clouds } from './Clouds';
import { CountryBorders } from './CountryBorders';
import { Starfield } from './Starfield';
import { Blips } from './Blips';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { useGlobeStore, useTheme } from '../store';

export function SceneRoot() {
  const select = useGlobeStore((s) => s.select);
  const theme = useTheme();

  return (
    <Canvas
      dpr={[1, 1.75]}
      // start well back so the whole planet reads as "Earth in space"
      camera={{ position: [1.0, 0.85, 3.3], fov: 45, near: 0.1, far: 120 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => select(null)}
      style={{ position: 'absolute', inset: 0, background: '#04070d' }}
    >
      <color attach="background" args={['#04070d']} />
      <Starfield />
      <Suspense fallback={null}>
        <Earth />
        {theme.clouds && <Clouds />}
      </Suspense>
      <CountryBorders />
      <Blips />
      <CameraRig />
      <Effects />
    </Canvas>
  );
}
