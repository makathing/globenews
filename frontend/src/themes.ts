import { categoryCssVars } from './lib/categoryColors';

/**
 * Site themes. One theme colours everything: the page chrome (applied as CSS
 * custom properties on <html>), the dotted globe and the category palette the
 * globe's lit dots use.
 */

export const THEME_IDS = ['midnight', 'dusk', 'paper', 'ocean'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface SiteTheme {
  id: ThemeId;
  label: string;
  /** Light themes get the deeper category palette and no stars. */
  light: boolean;
  /** Page chrome. */
  bg: string;
  panel: string;
  border: string;
  text: string;
  text2: string;
  dim: string;
  accent: string;
  accentInk: string;
  /** "r, g, b" of the overlay tint used for hairlines and hover washes. */
  tint: string;
  /** The globe: ocean at the centre and the limb, the land dots, the rim light. */
  ocean: string;
  limb: string;
  dot: string;
  rim: string;
  /** Sky behind the planet. */
  space: string;
  starBrightness: number;
  /** Visible sun glow strength (0 disables the sun billboard). */
  sunIntensity: number;
}

export const THEMES: Record<ThemeId, SiteTheme> = {
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    light: false,
    bg: '#0b1220',
    panel: '#131c2e',
    border: '#24304a',
    text: '#e8edf4',
    text2: '#a7b2c3',
    dim: '#8a97ab',
    accent: '#7cc4ff',
    accentInk: '#0b1220',
    tint: '255, 255, 255',
    ocean: '#0f1d38',
    limb: '#0a1427',
    dot: '#4a6185',
    rim: '#7cc4ff',
    space: '#03060c',
    starBrightness: 1,
    sunIntensity: 0.45,
  },
  dusk: {
    id: 'dusk',
    label: 'Dusk',
    light: false,
    bg: '#1a1430',
    panel: '#241c3f',
    border: '#3a2f5e',
    text: '#f3edf9',
    text2: '#c4b8d8',
    dim: '#a497bd',
    accent: '#ffb38a',
    accentInk: '#2a1a12',
    tint: '255, 255, 255',
    ocean: '#241a44',
    limb: '#170f2e',
    dot: '#64578f',
    rim: '#ffb38a',
    space: '#0a0716',
    starBrightness: 0.9,
    sunIntensity: 0.5,
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    light: true,
    bg: '#f5efe3',
    panel: '#fffcf6',
    border: '#e3d9c6',
    text: '#27231d',
    text2: '#5c5448',
    dim: '#6f6557',
    accent: '#b9512a',
    accentInk: '#ffffff',
    tint: '39, 35, 29',
    ocean: '#ebe2cf',
    limb: '#ddd1b8',
    dot: '#a99c82',
    rim: '#b9512a',
    space: '#f5efe3',
    starBrightness: 0,
    sunIntensity: 0,
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    light: false,
    bg: '#0c1d22',
    panel: '#12292f',
    border: '#22424a',
    text: '#e3f1ef',
    text2: '#a3c2bd',
    dim: '#86a8a3',
    accent: '#6fe3c1',
    accentInk: '#08241c',
    tint: '255, 255, 255',
    ocean: '#0f2a31',
    limb: '#091c21',
    dot: '#3b6e6e',
    rim: '#6fe3c1',
    space: '#040d10',
    starBrightness: 0.9,
    sunIntensity: 0.45,
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
  // also where visitors land who had one of the retired globe themes stored
  return 'midnight';
}

export function storeTheme(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable
  }
}

/** Push a theme's chrome colours onto <html> as the custom properties styles.css reads. */
export function applyTheme(theme: SiteTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.light ? 'light' : 'dark';
  const vars: Record<string, string> = {
    '--bg': theme.bg,
    '--panel-solid': theme.panel,
    '--panel-border': theme.border,
    '--text': theme.text,
    '--text-secondary': theme.text2,
    '--text-dim': theme.dim,
    '--accent': theme.accent,
    '--accent-ink': theme.accentInk,
    '--tint': theme.tint,
    '--shadow-alpha': theme.light ? '0.1' : '0.4',
    ...categoryCssVars(theme.light),
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}
