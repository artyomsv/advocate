import type { JSX, ReactNode } from 'react';
import { useEffect } from 'react';
import { resolveTheme, useThemeStore } from './useTheme';

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const apply = (): void => {
      const resolved = resolveTheme(theme);
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();
    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: light)');
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  return <>{children}</>;
}
