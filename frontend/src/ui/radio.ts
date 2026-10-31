import type { KeyboardEvent } from 'react';

/**
 * Arrow-key movement for a role="radiogroup" of buttons (roving tabindex:
 * only the checked radio is in the tab order). Arrows move and select, as the
 * ARIA radio pattern expects; Home/End jump to the ends.
 */
export function radioKeyDown<T extends string>(
  e: KeyboardEvent<HTMLElement>,
  ids: readonly T[],
  current: T,
  choose: (id: T) => void,
): void {
  const i = ids.indexOf(current);
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % ids.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = ids.length - 1;
  if (next < 0) return;
  e.preventDefault();
  choose(ids[next]);
  const group = e.currentTarget.closest('[role="radiogroup"]');
  const target = group?.querySelectorAll<HTMLElement>('[role="radio"]')[next];
  target?.focus();
  target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}
