/**
 * Fitting the globe into the part of the screen that is actually free. On a
 * phone the top bar and the bottom sheet cover the viewport's ends, so the
 * camera is pushed back until the planet fits the band between them, and the
 * projection is shifted (camera.setViewOffset) so the planet sits in that
 * band's middle rather than the screen's.
 */

/** On a phone the globe spans this much of the screen's width… */
export const PHONE_WIDTH_FILL = 0.92;
/** …unless the free band is shorter: then this much of the band, so it never clips. */
export const PHONE_BAND_FILL = 0.96;

/** The globe's on-screen diameter (px) for a band and a screen width. */
export function framedDiameter(bandPx: number, widthPx: number, widthFill = PHONE_WIDTH_FILL, bandFill = PHONE_BAND_FILL): number {
  return Math.max(48, Math.min(widthFill * widthPx, bandFill * bandPx));
}

/**
 * Camera distance (globe radius 1) at which the globe's diameter is
 * `framedDiameter` of the band: as wide as the screen allows, as tall as the
 * band allows.
 */
export function framedDistance({
  bandPx,
  widthPx,
  heightPx,
  fovDeg,
  widthFill = PHONE_WIDTH_FILL,
  bandFill = PHONE_BAND_FILL,
}: {
  bandPx: number;
  widthPx: number;
  heightPx: number;
  fovDeg: number;
  widthFill?: number;
  bandFill?: number;
}): number {
  const radiusPx = framedDiameter(bandPx, widthPx, widthFill, bandFill) / 2;
  const focal = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
  return Math.sqrt((focal / radiusPx) ** 2 + 1);
}

/**
 * The horizontal view offset (px) that moves the screen centre to the middle
 * of the band between `left` and `right` insets. Positive moves the picture left.
 */
export function viewOffsetX(left: number, right: number): number {
  return (right - left) / 2;
}

/**
 * The vertical view offset (px) that moves the screen centre to the middle of
 * the band between `top` and `bottom` insets. Positive moves the picture up.
 */
export function viewOffsetY(top: number, bottom: number): number {
  return (bottom - top) / 2;
}
