/** Globe render themes. `mode` selects the branch inside the Earth shader. */

export const THEME_IDS = ['obsidian', 'halftone', 'slate', 'blueprint', 'atlas', 'relief'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface GlobeTheme {
  id: ThemeId;
  label: string;
  /** Shader branch: 0 obsidian, 1 halftone, 2 slate, 3 blueprint, 4 atlas, 5 relief */
  mode: number;
  /** Inner rim (fresnel) tint + strength — kept subtle everywhere. */
  rimColor: string;
  rimStrength: number;
  borderColor: string;
  borderOpacity: number;
  clouds: boolean;
  /** Additive glow washes out on light surfaces; use normal blending there. */
  blipAdditive: boolean;
  starBrightness: number;
  /** Visible sun glow strength (0 disables the sun billboard). */
  sunIntensity: number;
  /** Multiplier on beam brightness — dialled down where the surface is bright. */
  beamIntensity: number;
  /** Strength of the dominant-category country wash. */
  tintOpacity: number;
}

/**
 * Every globe is deliberately neutral: the news beams are the only saturated
 * colour in the scene, so the map never competes with the data.
 */
export const THEMES: Record<ThemeId, GlobeTheme> = {
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian',
    mode: 0,
    rimColor: '#4a6a92',
    rimStrength: 0.16,
    borderColor: '#71839c',
    borderOpacity: 0.4,
    clouds: false,
    blipAdditive: true,
    starBrightness: 1,
    sunIntensity: 0.5,
    beamIntensity: 1,
    tintOpacity: 0.14,
  },
  halftone: {
    id: 'halftone',
    label: 'Halftone',
    mode: 1,
    rimColor: '#3f5f88',
    rimStrength: 0.12,
    borderColor: '#5b7a9c',
    borderOpacity: 0,
    clouds: false,
    blipAdditive: true,
    starBrightness: 1,
    sunIntensity: 0.45,
    beamIntensity: 1,
    tintOpacity: 0.1,
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    mode: 2,
    rimColor: '#5b7a9c',
    rimStrength: 0.14,
    borderColor: '#8fa2b8',
    borderOpacity: 0.22,
    clouds: false,
    blipAdditive: true,
    starBrightness: 0.9,
    sunIntensity: 0.6,
    beamIntensity: 1,
    tintOpacity: 0.13,
  },
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    mode: 3,
    rimColor: '#2f6ea8',
    rimStrength: 0.14,
    borderColor: '#6fb4e8',
    borderOpacity: 0.5,
    clouds: false,
    blipAdditive: true,
    starBrightness: 0.85,
    sunIntensity: 0.45,
    beamIntensity: 0.95,
    tintOpacity: 0.16,
  },
  atlas: {
    id: 'atlas',
    label: 'Atlas',
    mode: 4,
    rimColor: '#5fa8e0',
    rimStrength: 0.16,
    borderColor: '#cfe4f2',
    borderOpacity: 0.3,
    clouds: false,
    blipAdditive: true,
    starBrightness: 0.9,
    sunIntensity: 0.55,
    beamIntensity: 1,
    tintOpacity: 0.14,
  },
  relief: {
    id: 'relief',
    label: 'Relief',
    mode: 5,
    rimColor: '#54708f',
    rimStrength: 0.14,
    borderColor: '#93a3b6',
    borderOpacity: 0.26,
    clouds: false,
    blipAdditive: true,
    starBrightness: 0.9,
    sunIntensity: 0.5,
    beamIntensity: 1,
    tintOpacity: 0.13,
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
  return 'obsidian';
}

export function storeTheme(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable
  }
}
