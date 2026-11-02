import type { SVGProps } from 'react';
import type { Category } from '../../../shared/news';
import type { RegionId } from '../lib/regions';
import { REGION_SHAPE_VIEWBOX, REGION_SHAPES } from './regionShapes';

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

/**
 * One glyph per category, chosen to read at 14px without a label: crossed
 * swords, a warning sign, a ballot box, a rising bar chart, a heart with a
 * pulse, a lab flask, a thermometer, a group of people.
 */
const CATEGORY_GLYPHS: Record<Category, React.ReactNode> = {
  // crossed swords
  conflict: (
    <>
      <path d="M4 4l11.4 11.4M20 4L8.6 15.4" />
      <path d="M12 17.4l5.4-5.4M6.6 12l5.4 5.4" />
      <path d="M16.2 16.2l3.4 3.4M7.8 16.2l-3.4 3.4" strokeWidth={2.4} />
    </>
  ),
  // warning sign
  disaster: (
    <>
      <path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3l7.6-13.2Z" />
      <path d="M12 9.4v4.4" strokeWidth={2.2} />
      <path d="M12 17.2v.01" strokeWidth={2.8} />
    </>
  ),
  // ballot box
  politics: (
    <>
      <path d="M8.6 9.6V3.8h6.8v5.8" />
      <path d="M10.6 6.2l1.2 1.2 2-2.2" />
      <path d="M3.8 11.4h16.4V20H3.8z" />
      <path d="M8 11.4h8" strokeWidth={2.6} />
      <path d="M3.8 15.4h16.4" />
    </>
  ),
  // rising bar chart
  economy: (
    <>
      <path d="M6 20v-3.6M10 20v-5.4M14 20v-4.4M18 20v-7" strokeWidth={2.6} />
      <path d="M4.4 11.4 9 7.2l3.4 3L19.4 4" />
      <path d="M15.6 4h3.8v3.8" />
    </>
  ),
  // heart with a pulse line
  health: (
    <>
      <path d="M12 20.2s-7.8-4.6-7.8-10.6A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.8 2.5c0 6-7.8 10.6-7.8 10.6Z" />
      <path d="M5.2 12.8h3.6l1.4-2.6 2.2 4.8 1.6-3h4.8" />
    </>
  ),
  // lab flask
  science: (
    <>
      <path d="M9.4 3.8h5.2M10.2 3.8v5.6L4.8 18.4a1.3 1.3 0 0 0 1.1 2h12.2a1.3 1.3 0 0 0 1.1-2l-5.4-9V3.8" />
      <path d="M7.4 14.8h9.2" />
      <circle cx="11" cy="17.4" r=".7" fill="currentColor" stroke="none" />
      <circle cx="14" cy="16.6" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  // thermometer with rays
  climate: (
    <>
      <path d="M8.6 14.2V5.4a2.4 2.4 0 0 1 4.8 0v8.8a4 4 0 1 1-4.8 0Z" />
      <path d="M11 9v8.4" strokeWidth={2.4} />
      <circle cx="11" cy="17.4" r="1.6" fill="currentColor" stroke="none" />
      <path d="M17 6.4h3M17 10h3M17 13.6h2" />
    </>
  ),
  // a group of three people
  society: (
    <>
      <circle cx="12" cy="7.4" r="2.8" />
      <path d="M6.8 19.6c.4-3.6 2.4-5.6 5.2-5.6s4.8 2 5.2 5.6" />
      <circle cx="5.4" cy="9.6" r="2" />
      <path d="M2.4 17.4c.3-2.4 1.5-3.6 3.4-3.8" />
      <circle cx="18.6" cy="9.6" r="2" />
      <path d="M21.6 17.4c-.3-2.4-1.5-3.6-3.4-3.8" />
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

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.4 13.6a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7" />
      <path d="M13.6 10.4a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.8 12.6 9.6 17.4 19.2 6.9" />
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


export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6v11.2" />
      <path d="M8 7.4 12 3.4l4 4" />
      <path d="M7.4 10.6H6.2a1.6 1.6 0 0 0-1.6 1.6v6.6a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6v-6.6a1.6 1.6 0 0 0-1.6-1.6h-1.2" />
    </Svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.4 7.4 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.4a7.4 7.4 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.4 7.4 0 0 0 2.6 1.5l.5 2.4h4l.5-2.4a7.4 7.4 0 0 0 2.6-1.5l2.3.9 2-3.4Z" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.8 5.6 8.4 12l6.4 6.4" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9.2l6 6 6-6" />
    </Svg>
  );
}

/** A funnel: the category filter. */
export function FilterIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.8 5h16.4l-6.4 7.6v5.6l-3.6 1.8v-7.4L3.8 5Z" />
    </Svg>
  );
}

/** The world: a globe. The other regions are outlines of their real geography (regionShapes.ts). */
const WORLD_GLYPH = (
  <>
    <circle cx="12" cy="12" r="8.6" />
    <ellipse cx="12" cy="12" rx="3.8" ry="8.6" />
    <path d="M3.6 9.2h16.8M3.6 14.8h16.8" />
  </>
);

export function RegionIcon({ region, ...props }: IconProps & { region: RegionId }) {
  if (region === 'world') return <Svg {...props}>{WORLD_GLYPH}</Svg>;
  const shape = REGION_SHAPES[region];
  // filled, with a thin stroke of the same colour so the seams between
  // separately simplified countries close up
  return (
    <Svg {...props} viewBox={REGION_SHAPE_VIEWBOX} strokeWidth={0.5}>
      {shape.context && <path d={shape.context} fill="currentColor" opacity={0.3} stroke="none" />}
      <path d={shape.d} fill="currentColor" />
    </Svg>
  );
}
