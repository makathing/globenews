import type { SVGProps } from 'react';
import type { Category } from '../../../shared/news';

/**
 * Inline SVG icon set — one consistent 1.8px-stroke style, sized via `size`,
 * colored via `currentColor` (or an explicit `color`).
 */

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Svg({ size = 15, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

const CATEGORY_GLYPHS: Record<Category, React.ReactNode> = {
  // crosshair
  conflict: (
    <>
      <circle cx="12" cy="12" r="6.2" />
      <path d="M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4" />
    </>
  ),
  // warning triangle
  disaster: (
    <>
      <path d="M12 3.6 21.4 20H2.6L12 3.6Z" />
      <path d="M12 10v4.4" />
      <path d="M12 17.1v.01" strokeWidth={2.6} />
    </>
  ),
  // landmark / civic building
  politics: (
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M5.5 9.5V18M10 9.5V18M14 9.5V18M18.5 9.5V18" />
      <path d="M3.5 20.2h17" />
    </>
  ),
  // trend line
  economy: (
    <>
      <path d="M3.5 18.5 9.5 12l4 4 7-8" />
      <path d="M15.8 8h4.7v4.7" />
    </>
  ),
  // medical cross
  health: (
    <path d="M9.6 4h4.8v5.6H20v4.8h-5.6V20H9.6v-5.6H4V9.6h5.6V4Z" />
  ),
  // atom
  science: (
    <>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(62 12 12)" />
    </>
  ),
  // leaf
  climate: (
    <>
      <path d="M19.5 4.5C12 4.5 5.6 8.5 5.6 15.8c0 1.4.3 2.5.7 3.4 4-9 9.4-11 13.2-14.7Z" />
      <path d="M4.5 20.5c2.5-6.5 6.5-10 12-12.5" />
    </>
  ),
  // two figures
  society: (
    <>
      <circle cx="8.6" cy="8" r="3" />
      <path d="M3.2 19.6c.5-3.6 2.7-5.6 5.4-5.6s4.9 2 5.4 5.6" />
      <circle cx="16.8" cy="9" r="2.4" />
      <path d="M15.8 13.9c2.6.2 4.4 2 4.9 5.1" />
    </>
  ),
};

export function CategoryIcon({ category, ...props }: IconProps & { category: Category }) {
  return <Svg {...props}>{CATEGORY_GLYPHS[category]}</Svg>;
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 19 6v5.4c0 4.6-2.9 7.7-7 9.4-4.1-1.7-7-4.8-7-9.4V6l7-2.8Z" />
      <path d="M8.8 11.8l2.2 2.2 4.2-4.2" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.4V12l3 2" />
    </Svg>
  );
}

/**
 * Mini glyph of a category's on-globe radar signature — used by the legend to
 * teach the mapping. Mirrors the shapes drawn by the blip shader.
 */
export function SignatureGlyph({ category, size = 16, ...rest }: IconProps & { category: Category }) {
  const shapes: Record<Category, React.ReactNode> = {
    // rings + radial spikes
    conflict: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 3.4v3M12 17.6v3M3.4 12h3M17.6 12h3" />
      </>
    ),
    // double shockwave
    disaster: (
      <>
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="8" opacity="0.55" />
      </>
    ),
    // ring + orbiting satellite
    politics: (
      <>
        <circle cx="12" cy="12" r="5.6" />
        <circle cx="18.6" cy="7.4" r="1.7" fill="currentColor" stroke="none" />
      </>
    ),
    // diamond ring
    economy: <path d="M12 4.4 19.6 12 12 19.6 4.4 12 12 4.4Z" />,
    // plus ring
    health: <path d="M9.4 5h5.2v4.4H19v5.2h-4.4V19H9.4v-4.4H5V9.4h4.4V5Z" />,
    // hex ring
    science: <path d="M12 4.2l6.8 3.9v7.8L12 19.8l-6.8-3.9V8.1L12 4.2Z" />,
    // ripple
    climate: (
      <>
        <path d="M6.5 12a5.5 5.5 0 0 1 11 0" />
        <path d="M4 14.5a8 8 0 0 1 16 0" opacity="0.55" />
        <path d="M9 15.4a3 3 0 0 1 6 0" />
      </>
    ),
    // segmented ring
    society: <circle cx="12" cy="12" r="6.4" strokeDasharray="3.2 2.6" />,
  };
  return (
    <Svg size={size} {...rest}>
      {shapes[category]}
    </Svg>
  );
}
