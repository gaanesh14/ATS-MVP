'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'photonx:theme';

type ThemeContextValue = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = t;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read the value the inline boot script wrote to <html> so the React state
  // matches what's already painted — avoids a flash and a hydration mismatch.
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const initial = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setThemeState(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try { window.localStorage.setItem(STORAGE_KEY, t); } catch {}
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Inline script run before React hydrates — sets the .dark class on <html>
// from localStorage (or system preference) so the user never sees a flash of
// the wrong theme.
export const themeInitScript = `(() => {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();`;
