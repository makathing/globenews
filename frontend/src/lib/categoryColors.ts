import { CATEGORIES, type Category } from '../../../shared/news';

/**
 * One hue per category, lighting up the globe's own dots where a story is.
 * Two tunings of the same hues: bright for dark themes, deeper for light ones
 * so they keep their contrast on a cream ground.
 */
const DARK: Record<Category, string> = {
  conflict: '#ff6b6b',
  disaster: '#ff9f43',
  politics: '#a78bfa',
  economy: '#f7c948',
  health: '#f472b6',
  science: '#38d9e8',
  climate: '#5ed27a',
  society: '#60a5fa',
};

const LIGHT: Record<Category, string> = {
  conflict: '#cc3338',
  disaster: '#c96a0a',
  politics: '#7346d0',
  economy: '#9c7a00',
  health: '#c13a86',
  science: '#0d8698',
  climate: '#2b8f45',
  society: '#2b67c8',
};

export function categoryPalette(light: boolean): Record<Category, string> {
  return light ? LIGHT : DARK;
}

/** `--cat-<category>` custom properties, so the rail colours match the globe. */
export function categoryCssVars(light: boolean): Record<string, string> {
  const palette = categoryPalette(light);
  return Object.fromEntries(CATEGORIES.map((category) => [`--cat-${category}`, palette[category]]));
}
