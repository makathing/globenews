export const MARKER_STYLES = ['beams', 'pins'] as const;

export type MarkerStyle = (typeof MARKER_STYLES)[number];

export const MARKER_STYLE_LABELS: Record<MarkerStyle, string> = {
  beams: 'Beams',
  pins: 'Pins',
};

const STORAGE_KEY = 'globenews-markers';

function isMarkerStyle(value: string | null): value is MarkerStyle {
  return value !== null && (MARKER_STYLES as readonly string[]).includes(value);
}

export function loadStoredMarkerStyle(): MarkerStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isMarkerStyle(stored)) return stored;
  } catch {
    // storage unavailable
  }
  return 'beams';
}

export function storeMarkerStyle(style: MarkerStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // storage unavailable
  }
}

/**
 * `?markers=pins` picks a style for one visit — for a link or a test — without
 * touching what the visitor chose. Read once at startup and never written back.
 */
export function markerStyleFromUrl(): MarkerStyle | null {
  if (typeof window === 'undefined') return null;
  const value = new URL(window.location.href).searchParams.get('markers');
  return isMarkerStyle(value) ? value : null;
}
