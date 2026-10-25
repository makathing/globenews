import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { applyTheme, THEMES } from './themes';
import { useGlobeStore } from './store';

// before the first paint, so a stored light theme never flashes dark
applyTheme(THEMES[useGlobeStore.getState().theme]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
