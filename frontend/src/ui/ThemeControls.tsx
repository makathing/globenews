import { useGlobeStore } from '../store';
import { THEME_IDS, THEMES } from '../themes';
import { radioKeyDown } from './radio';

/** The site theme picker and the space-view switch (rail footer / settings sheet). */
export function ThemeControls() {
  const theme = useGlobeStore((s) => s.theme);
  const setTheme = useGlobeStore((s) => s.setTheme);
  const space = useGlobeStore((s) => s.space);
  const setSpace = useGlobeStore((s) => s.setSpace);
  return (
    <>
      <div className="theme-picker" role="radiogroup" aria-label="Theme">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={theme === id}
            tabIndex={theme === id ? 0 : -1}
            className={`theme-btn ${theme === id ? 'active' : ''}`}
            onClick={() => setTheme(id)}
            onKeyDown={(e) => radioKeyDown(e, THEME_IDS, theme, setTheme)}
          >
            <span
              className="theme-swatch"
              style={{ background: THEMES[id].bg, boxShadow: `inset 0 0 0 2px ${THEMES[id].accent}` }}
              aria-hidden
            />
            {THEMES[id].label}
          </button>
        ))}
      </div>
      {/* a light theme has no night sky, so the switch only exists on dark ones */}
      {!THEMES[theme].light && (
        <button
          role="switch"
          aria-checked={space}
          className={`space-toggle ${space ? 'on' : ''}`}
          onClick={() => setSpace(!space)}
        >
          Space view
          <span className="space-toggle-track" aria-hidden="true">
            <span className="space-toggle-thumb" />
          </span>
        </button>
      )}
    </>
  );
}
