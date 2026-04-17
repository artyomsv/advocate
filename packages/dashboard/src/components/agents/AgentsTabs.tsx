import type { JSX } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';

const TABS = [
  { to: '/agents', label: 'Structure', end: true },
  { to: '/agents/activity', label: 'Activity', end: false },
  { to: '/agents/config', label: 'Config', end: false },
] as const;

export function AgentsTabs(): JSX.Element {
  return (
    <nav className="glass inline-flex gap-0.5 p-0.5">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'rounded-[10px] px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-[var(--accent-muted)] text-[var(--color-accent)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
