import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * A button that opens a menu (the WAI-ARIA menu button pattern): Enter,
 * Space or ArrowDown opens it with focus on the current item, arrows move,
 * Home/End jump, Escape closes and returns focus to the button, Tab closes
 * and moves on, and a tap anywhere else closes it.
 *
 * Items are any `[role^="menuitem"]` descendants of the menu; `closeOnPick`
 * says whether choosing one closes the menu (a radio list does, a set of
 * toggles stays open).
 */
export function DropMenu({
  className,
  buttonClassName,
  buttonLabel,
  buttonContent,
  menuLabel,
  align,
  children,
}: {
  className?: string;
  buttonClassName: string;
  buttonLabel: string;
  buttonContent: ReactNode;
  menuLabel: string;
  align: 'start' | 'end';
  children: (close: (refocus?: boolean) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  }, []);

  // on open: focus the checked item (or the first)
  const focusOnOpen = useRef<'checked' | 'last'>('checked');
  useEffect(() => {
    if (!open) return;
    const list = items();
    const target =
      focusOnOpen.current === 'last'
        ? list[list.length - 1]
        : list.find((el) => el.getAttribute('aria-checked') === 'true' && el.getAttribute('role') === 'menuitemradio') ??
          list[0];
    target?.focus({ preventScroll: true });
  }, [open]);

  // a tap outside closes it
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, close]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'checked';
      setOpen(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    } else if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div ref={wrapRef} className={`drop ${className ?? ''}`}>
      <button
        ref={buttonRef}
        className={buttonClassName}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          focusOnOpen.current = 'checked';
          setOpen((o) => !o);
        }}
        onKeyDown={onButtonKey}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className={`drop-menu drop-menu-${align}`}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKey}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
