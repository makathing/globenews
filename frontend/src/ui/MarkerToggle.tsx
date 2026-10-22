import type { ComponentType } from 'react';
import { MARKER_STYLES, MARKER_STYLE_LABELS, type MarkerStyle } from '../lib/markerStyle';
import { useGlobeStore } from '../store';
import { BeamsIcon, PinsIcon, SculpturesIcon } from './icons';

/**
 * The marker switch, on the globe, phones only.
 *
 * The rail's footer carries the same control as a proper radiogroup, but on a
 * phone that rail is a drawer: the switch sat behind a ☰ tap, at the bottom of
 * a scrolling list, styled exactly like the six theme buttons above it. A
 * control for comparing looks is worthless if you have to go looking for it,
 * so on small screens it also sits under the drawer button, showing which
 * style is on and stepping to the next one when tapped.
 *
 * It reads the same store field as the drawer's radiogroup, so the two can
 * never disagree.
 */

const ICONS: Record<MarkerStyle, ComponentType<{ size?: number }>> = {
  sculptures: SculpturesIcon,
  beams: BeamsIcon,
  pins: PinsIcon,
};

export function MarkerToggle() {
  const markerStyle = useGlobeStore((s) => s.markerStyle);
  const setMarkerStyle = useGlobeStore((s) => s.setMarkerStyle);
  const next = MARKER_STYLES[(MARKER_STYLES.indexOf(markerStyle) + 1) % MARKER_STYLES.length];
  const Icon = ICONS[markerStyle];

  return (
    <button
      className="marker-toggle"
      onClick={() => setMarkerStyle(next)}
      // the word names the state, so the label has to name the action
      aria-label={`Markers: ${MARKER_STYLE_LABELS[markerStyle]}. Switch to ${MARKER_STYLE_LABELS[next]}.`}
      title={`Switch to ${MARKER_STYLE_LABELS[next]}`}
    >
      <Icon size={14} />
      <span>{MARKER_STYLE_LABELS[markerStyle]}</span>
    </button>
  );
}
