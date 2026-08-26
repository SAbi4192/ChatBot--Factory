/**
 * Scarlet Theme Manager
 * Handles dark/light mode toggling with localStorage persistence.
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'scarlet:theme';

/** Get the current theme from localStorage (defaults to 'dark'). */
export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* SSR or storage unavailable */ }
  return 'dark';
}

/** Apply a theme to the document root. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }
}

/** Toggle between dark and light. Returns the new theme. */
export function toggleTheme(): Theme {
  const current = getTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

/** Initialize theme on app load (call once in main.tsx or App.tsx). */
export function initTheme(): Theme {
  const theme = getTheme();
  applyTheme(theme);
  return theme;
}
