/**
 * Fitting the globe into the part of the screen that is actually free. On a
 * phone the top bar and the bottom sheet cover the viewport's ends, so the
 * camera is pushed back until the planet fits the band between them, and the
 * projection is shifted (camera.setViewOffset) so the planet sits in that
 * band's middle rather than the screen's.
 */

/** Camera distance (globe radius 1) at which the globe's diameter spans `fill` of the band. */
export function framedDistance({
  bandPx,
  widthPx,
  heightPx,
  fovDeg,
  fill = 0.86,
}: {
  bandPx: number;
  widthPx: number;
  heightPx: number;
  fovDeg: number;
  fill?: number;
}): number {
  const radiusPx = Math.max(24, (fill * Math.min(bandPx, widthPx)) / 2);
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
