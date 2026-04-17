import { Monitor, Moon, Sun } from 'lucide-react';
import type { JSX } from 'react';
import { type Theme, useThemeStore } from '../../theme/useTheme';

interface Option {
  value: Theme;
  icon: typeof Sun;
  label: string;
}

const OPTIONS: readonly Option[] = [
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'light', icon: Sun, label: 'Light' },
];

export function ThemeToggle(): JSX.Element {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="glass flex items-center gap-0.5 p-0.5">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            onClick={() => setTheme(opt.value)}
            className={[
              'flex h-7 w-7 items-center justify-center rounded-[10px] transition-colors',
              active
                ? 'bg-[var(--accent-muted)] text-[var(--color-accent)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
            ].join(' ')}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
