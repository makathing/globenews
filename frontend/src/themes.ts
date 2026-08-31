/** Globe render themes. `mode` selects the branch inside the Earth shader. */

export const THEME_IDS = ['satellite', 'minimal', 'light', 'night', 'grid'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface GlobeTheme {
  id: ThemeId;
  label: string;
  /** Shader branch: 0 satellite, 1 minimal, 2 light, 3 night, 4 grid */
  mode: number;
  /** Inner rim (fresnel) tint + strength — kept subtle everywhere. */
  rimColor: string;
  rimStrength: number;
  borderColor: string;
  borderOpacity: number;
  clouds: boolean;
  /** Additive blips wash out on light surfaces; use normal blending there. */
  blipAdditive: boolean;
  starBrightness: number;
  /** Visible sun glow strength (0 disables the sun billboard). */
  sunIntensity: number;
  /** Multiplier on beam brightness — dialled down where the surface is bright. */
  beamIntensity: number;
  /** Strength of the dominant-category country wash. */
  tintOpacity: number;
}

export const THEMES: Record<ThemeId, GlobeTheme> = {
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    mode: 0,
    rimColor: '#3a7bd5',
    rimStrength: 0.22,
    borderColor: '#7dd2e8',
    borderOpacity: 0.22,
    clouds: true,
    blipAdditive: true,
    starBrightness: 1,
    sunIntensity: 1.0,
    beamIntensity: 1.0,
    tintOpacity: 0.16,
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    mode: 1,
    rimColor: '#38547a',
    rimStrength: 0.16,
    borderColor: '#6fa4d8',
    borderOpacity: 0.45,
    clouds: false,
    blipAdditive: true,
    starBrightness: 0.8,
    sunIntensity: 0.55,
    beamIntensity: 0.95,
    tintOpacity: 0.3,
  },
  light: {
    id: 'light',
    label: 'Light',
    mode: 2,
    rimColor: '#ffffff',
    rimStrength: 0.1,
    borderColor: '#7c8aa0',
    borderOpacity: 0.55,
    clouds: false,
    blipAdditive: false,
    starBrightness: 0.55,
    sunIntensity: 0.4,
    beamIntensity: 0.85,
    tintOpacity: 0.26,
  },
  night: {
    id: 'night',
    label: 'Night',
    mode: 3,
    rimColor: '#2c4a8a',
    rimStrength: 0.18,
    borderColor: '#4d6d96',
    borderOpacity: 0.3,
    clouds: false,
    blipAdditive: true,
    starBrightness: 1,
    sunIntensity: 1.0,
    beamIntensity: 1.0,
    tintOpacity: 0.22,
  },
  grid: {
    id: 'grid',
    label: 'Grid',
    mode: 4,
    rimColor: '#2f6ea8',
    rimStrength: 0.14,
    borderColor: '#5fb0ff',
    borderOpacity: 0.7,
    clouds: false,
    blipAdditive: true,
    starBrightness: 0.7,
    sunIntensity: 0.5,
    beamIntensity: 0.9,
    tintOpacity: 0.34,
  },
};

const STORAGE_KEY = 'globenews-theme';

export function loadStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (THEME_IDS as readonly string[]).includes(stored)) return stored as ThemeId;
  } catch {
    // storage unavailable
  }
  return 'satellite';
}

export function storeTheme(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable
  }
}
