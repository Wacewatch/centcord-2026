import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const KEY = 'cc_theme';
const ThemeCtx = createContext({ theme: 'dark', setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem(KEY) || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('cc-light', theme === 'light');
    root.classList.toggle('cc-dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F4F4F4' : '#FF3B00');
  }, [theme]);

  const setTheme = useCallback((t) => setThemeState(t === 'light' ? 'light' : 'dark'), []);
  const toggle = useCallback(() => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')), []);

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() { return useContext(ThemeCtx); }
