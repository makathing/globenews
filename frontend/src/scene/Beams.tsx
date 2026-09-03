import { useMemo } from 'react';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { beamColor, beamHeight, beamRate, beamWidth } from '../lib/beams';
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
 * Vertical light shafts rising from each event's location. Height and colour
 * both encode severity, brightness encodes freshness; category shows up only
 * as a shaft pattern. Beams tall enough to clear the horizon stay visible over
 * the limb, which is how far-side events announce themselves.
 *
 * Everything here is tuned for three viewpoints at once. From orbit a beam is
 * a few pixels wide and needs glow to exist at all; flown in, that same glow
 * is a smear; zoomed all the way out, a cluster of glows piles into one.
 * `uProximity` and `uFar` are how the shaders tell them apart.
 */

/* — shaft: a quad standing on the surface, billboarded about its own axis — */
const shaftVertex = /* glsl */ `
  uniform float uHeight;
  uniform float uWidth;
  uniform float uBoost;
  uniform float uFar;
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

    // narrower when zoomed out, where neighbours would otherwise overlap
    float halfWidth = uWidth * (1.0 + uBoost * 0.55) * mix(1.0, 0.8, uFar);
    // a spire: dense at the base, thinning to a needle — volume with a point
    float taper = mix(1.0, 0.55, uv.y);
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
  uniform float uProximity;   // 0 = orbital distance, 1 = right up against it
  uniform float uFar;         // 0 = orbital distance, 1 = fully zoomed out
  uniform float uAxisView;    // |dot(beam axis, view dir)|: 1 = looking down it
  uniform int uPattern;
  varying vec2 vUv;

  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;   // 0 at core, 1 at edge
    float y = vUv.y;                     // 0 at base, 1 at tip
    float near = uProximity;

    // Volumetric cross-section. From orbit a beam is a few pixels wide, so it
    // needs a wide haze to register at all; up close that same haze is a white
    // smear across the screen. Trade haze for a tighter, better-defined core
    // as you approach — glow at range, structure in the near field. Zoomed
    // right out the haze is what piles a cluster into one smear, so it thins
    // there too.
    float core = smoothstep(1.0, 0.0, x);
    float haze = pow(core, 1.35) * mix(0.55, 0.16, near) * mix(1.0, 0.7, uFar);
    float body = haze + pow(core, mix(5.0, 9.0, near)) * 0.75;
    // a crisp edge rail, invisible from orbit, that gives the shaft a
    // silhouette instead of a gradient once you're close enough to see it
    body += smoothstep(0.86, 0.66, x) * smoothstep(0.52, 0.72, x) * near * 0.5;
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

    // A soft swell near the top so tall beams still terminate visibly — a
    // distance affordance. Up close it is just a blob over the shaft, so it
    // fades out exactly as the shaft itself becomes legible.
    float cap = pow(max(1.0 - length(vec2(x * 1.1, (y - 0.66) * 2.0)), 0.0), 3.2);
    cap *= 1.0 - near;
    alpha += cap * 0.16 * (1.0 + uBoost);

    vec3 color = uColor;
    if (uBreaking > 0.5) {
      // white-hot core, faster strobe
      float strobe = 0.5 + 0.5 * sin(uTime * 7.0);
      color = mix(color, vec3(1.0), core * (0.35 + 0.35 * strobe));
      alpha *= 1.15;
    }
    color = mix(color, vec3(1.0), max(pulse * 0.45, cap * 0.12));

    alpha *= (0.55 + 0.45 * uFresh) * (0.85 + uBoost * 0.9) * uIntensity;
    // Additive blending clips at 1.0, and a clipped core is a flat white
    // region with no gradient left in it — which is what a near beam was.
    // Pull the whole shaft down as you approach so it lands under saturation.
    alpha *= mix(1.0, 0.55, near);
    // ...and down a little when zoomed out, where many overlap
    alpha *= mix(1.0, 0.8, uFar);
    // Selecting a story flies the camera onto the event's own normal, so you
    // end up sighting straight down the shaft, where a vertical beam has no
    // shape to show. Yield instead of drawing a bright blob — the pool below
    // takes over as the marker.
    alpha *= 1.0 - smoothstep(0.72, 0.97, uAxisView) * 0.75;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * (1.0 + uBoost * 0.5), min(alpha, 1.0));
  }
`;

function Beam({ event }: { event: NewsEvent }) {
  const theme = useTheme();
  const height = beamHeight(event.severity);
  const width = beamWidth(event.severity);
  const { position, quaternion, axis } = useSurfaceFrame(event.lat, event.lon);

  const { shaft, pool } = useMemo(() => {
    const color = new THREE.Color(beamColor(event));
    return {
      shaft: new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        // depthTest against the Earth keeps far-side beams correctly occluded —
        // only the tall ones crest the limb, which is the discoverability cue
        depthTest: true,
        blending: theme.blipAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: shaftVertex,
        fragmentShader: shaftFragment,
        side: THREE.DoubleSide,
        uniforms: {
          ...sharedMarkerUniforms(color, event.isBreaking),
          uHeight: { value: height },
          uWidth: { value: width },
          uRate: { value: beamRate(event.severity) },
          uPattern: { value: CATEGORY_PATTERN[event.category] },
        },
      }),
      pool: makePoolMaterial(
        sharedMarkerUniforms(color, event.isBreaking),
        theme.blipAdditive,
      ),
    };
  }, [event, theme.blipAdditive, height, width]);

  const pointerInsideRef = useMarkerFrame(event, position, axis, (frame) => {
    applyFrame(shaft, frame);
    applyFrame(pool, frame);
  });
  const handlers = useMarkerPointer(event, pointerInsideRef);

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

      <MarkerHitTarget
        height={height}
        radiusTop={width * 2.6}
        radiusBottom={width * 3.4}
        handlers={handlers}
      />
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
