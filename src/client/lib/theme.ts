import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'lablink.theme';

/** Saved preference first, otherwise follow the operating system setting. */
export function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Theme is a data attribute on <html>, so CSS variables switch without inline styles (CSP-safe). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) ?? initialTheme(),
  );
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);
  return [theme, toggle];
}
