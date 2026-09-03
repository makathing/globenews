import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { beamColor, beamWidth } from '../lib/beams';
import { useGlyphAtlas } from '../lib/glyphAtlas';
import {
  PIN_GLYPH_FADE_PX,
  PIN_MIN_NEEDLE_PX,
  PIN_NEEDLE_PX,
  pinHeadPx,
  pinNeedleLength,
} from '../lib/pins';
import { CATEGORY_PATTERN } from '../lib/signatures';
import { useTheme, useVisibleEvents } from '../store';
import {
  MarkerHitTarget,
  applyFrame,
  makePoolMaterial,
  sharedMarkerUniforms,
  useMarkerFrame,
  useMarkerPointer,
  useSurfaceFrame,
} from './markerShared';

/**
 * Map pins: a short needle standing on the surface with a category disc on
 * top. Where a beam is a volume that grows and shrinks with the camera, a pin
 * holds its size on screen — the head is measured in pixels — so a cluster of
 * stories reads as a cluster of markers at any zoom rather than a wash of
 * light. Severity sets the head size; the pool underneath is the same one the
 * beams stand in.
 *
 * The trade: pins are short and depth-tested, so far-side stories no longer
 * crest the limb the way tall beams do. You turn the globe to find them.
 */

/** Dark ink for the glyph cut into the head. */
const PIN_INK = new THREE.Color('#06121c');

/* — needle: a hairline quad standing on the surface, billboarded about its axis — */
const needleVertex = /* glsl */ `
  uniform float uHeight;
  uniform float uWidth;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 axis = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
    vec4 baseView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 toEye = normalize(-baseView.xyz);
    vec3 side = cross(axis, toEye);
    side = length(side) < 1e-4 ? normalize(cross(axis, vec3(0.0, 0.0, 1.0))) : normalize(side);
    vec3 offset = side * (position.x * 2.0 * uWidth) + axis * (uv.y * uHeight);
    gl_Position = projectionMatrix * (baseView + vec4(offset, 0.0));
  }
`;

const needleFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFresh;
  uniform float uIntensity;
  uniform float uBoost;
  varying vec2 vUv;

  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;
    // solid down the middle, soft at the edges; brighter toward the head so
    // the eye travels up the stalk to the disc
    float alpha = smoothstep(1.0, 0.55, x) * mix(0.55, 1.0, vUv.y);
    alpha *= (0.6 + 0.4 * uFresh) * uIntensity * (0.85 + uBoost * 0.6);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor * 0.8, min(alpha, 1.0));
  }
`;

/* — head: a screen-sized disc carrying the category glyph — */
const headVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Full billboard. The group's world scale is the head's size in world
    // units, so offsetting the view-space centre by it keeps the disc facing
    // the camera at exactly the size the frame asked for.
    vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 scaled = vec3(
      length(modelMatrix[0].xyz) * position.x,
      length(modelMatrix[1].xyz) * position.y,
      0.0
    );
    gl_Position = projectionMatrix * (center + vec4(scaled, 0.0));
  }
`;

const headFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uInk;
  uniform float uTime;
  uniform float uBoost;
  uniform float uFresh;
  uniform float uIntensity;
  uniform float uBreaking;
  uniform int uGlyph;
  uniform float uGlyphMix;
  uniform float uCells;
  uniform sampler2D uAtlas;
  varying vec2 vUv;

  void main() {
    // quad is twice the disc so a breaking ring has somewhere to expand into
    vec2 q = (vUv - 0.5) * 4.0;   // disc edge at length(q) == 1
    float d = length(q);

    float fill = smoothstep(1.0, 0.92, d);
    float rim = smoothstep(0.1, 0.0, abs(d - 0.94));
    // a small off-centre highlight so the disc reads as a raised cap
    float hi = pow(max(1.0 - length(q - vec2(-0.3, 0.38)) * 1.6, 0.0), 2.0) * 0.35;

    // Fill sits deliberately under Bloom's threshold: a flat disc should be a
    // shape, not a lamp. The rim and highlight are allowed over it, so what
    // blooms is a thin edge.
    vec3 color = uColor * 0.78;
    color = mix(color, uColor, rim);
    color += hi;

    float alpha = max(fill, rim);

    // category glyph, cut into the disc as dark ink; fades out when the head
    // is too small for the shape to survive
    if (uGlyphMix > 0.001 && d < 0.66) {
      vec2 guv = q / 1.32 + 0.5;
      vec2 auv = vec2((guv.x + float(uGlyph)) / uCells, guv.y);
      float ink = texture2D(uAtlas, auv).a * uGlyphMix * fill;
      color = mix(color, uInk, ink);
    }

    if (uBreaking > 0.5) {
      // a ring leaving the pin, once a second
      float p = fract(uTime * 0.9);
      float pulse = smoothstep(0.12, 0.0, abs(d - (1.0 + p * 0.9))) * (1.0 - p);
      alpha = max(alpha, pulse * 0.7);
      color = mix(color, vec3(1.0), pulse * 0.5);
    }

    // A pin is an object, not a light: an older story dims but never turns
    // translucent, or the map shows through the marker.
    color *= (0.68 + 0.32 * uFresh) * (1.0 + 0.35 * uBoost);
    alpha *= uIntensity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, min(alpha, 1.0));
  }
`;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function Pin({ event }: { event: NewsEvent }) {
  const theme = useTheme();
  const { texture, ready } = useGlyphAtlas();
  const { position, quaternion, axis } = useSurfaceFrame(event.lat, event.lon);
  const headRef = useRef<THREE.Group>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const { needle, head, pool } = useMemo(() => {
    const color = new THREE.Color(beamColor(event));
    const common = {
      transparent: true,
      depthWrite: false,
      depthTest: true,
    };
    return {
      needle: new THREE.ShaderMaterial({
        ...common,
        // a pin is a solid object, not a light: normal blending, so overlapping
        // pins stack as shapes instead of summing into a glow
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        vertexShader: needleVertex,
        fragmentShader: needleFragment,
        uniforms: {
          ...sharedMarkerUniforms(color, event.isBreaking),
          uHeight: { value: pinNeedleLength(event.severity) },
          uWidth: { value: 0.002 },
        },
      }),
      head: new THREE.ShaderMaterial({
        ...common,
        blending: THREE.NormalBlending,
        vertexShader: headVertex,
        fragmentShader: headFragment,
        uniforms: {
          ...sharedMarkerUniforms(color, event.isBreaking),
          uInk: { value: PIN_INK.clone() },
          uGlyph: { value: CATEGORY_PATTERN[event.category] },
          uGlyphMix: { value: 0 },
          uCells: { value: 8 },
          uAtlas: { value: texture },
        },
      }),
      pool: makePoolMaterial(sharedMarkerUniforms(color, event.isBreaking), theme.blipAdditive),
    };
  }, [event, theme.blipAdditive, texture]);

  const pointerInsideRef = useMarkerFrame(event, position, axis, (frame) => {
    applyFrame(needle, frame);
    applyFrame(head, frame);
    applyFrame(pool, frame);

    // the needle never falls below a legible length on screen, so a pin at
    // full zoom-out is still a pin and not a dot
    const length = Math.max(
      pinNeedleLength(event.severity),
      PIN_MIN_NEEDLE_PX * frame.worldPerPixel,
    );
    needle.uniforms.uHeight.value = length;
    needle.uniforms.uWidth.value = PIN_NEEDLE_PX * frame.worldPerPixel;

    const headPx =
      pinHeadPx(event.severity) * (1 + 0.35 * frame.boost) * (1 + 0.5 * frame.proximity);
    if (headRef.current) {
      headRef.current.position.y = length;
      // quad geometry is 1×1 and the shader spreads the disc over half of it,
      // so the group scale is twice the head's diameter in world units
      headRef.current.scale.setScalar(2 * headPx * frame.worldPerPixel);
    }
    head.uniforms.uGlyphMix.value = readyRef.current
      ? smoothstep(PIN_GLYPH_FADE_PX[0], PIN_GLYPH_FADE_PX[1], headPx)
      : 0;
  });
  const handlers = useMarkerPointer(event, pointerInsideRef);

  const poolSize = beamWidth(event.severity) * 3.6;
  const needleFloor = pinNeedleLength(event.severity);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh material={needle} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>

      <mesh material={pool} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[poolSize, poolSize]} />
      </mesh>

      <group ref={headRef} position={[0, needleFloor, 0]}>
        <mesh material={head} frustumCulled={false}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        {/* the head is the target you actually aim at, and it scales with it */}
        <mesh visible={false} {...handlers}>
          <sphereGeometry args={[0.3, 8, 6]} />
          <meshBasicMaterial />
        </mesh>
      </group>

      {/* the stalk takes a pointer too, so a near-miss below the head still hits */}
      <MarkerHitTarget
        height={needleFloor}
        radiusTop={0.012}
        radiusBottom={0.016}
        handlers={handlers}
      />
    </group>
  );
}

export function Pins() {
  const events = useVisibleEvents();
  return (
    <group name="pins">
      {events.map((event) => (
        <Pin key={event.id} event={event} />
      ))}
    </group>
  );
}
