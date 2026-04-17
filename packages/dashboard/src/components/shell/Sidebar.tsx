import type { JSX } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui.store';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/queue', label: 'Queue' },
  { to: '/legends', label: 'Legends' },
] as const;

export function Sidebar(): JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <aside
      className={cn(
        'flex flex-col border-r border-slate-800 bg-slate-900',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className="p-4 text-lg font-semibold">{collapsed ? 'M' : 'Mynah'}</div>
      <nav className="flex flex-col gap-1 p-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              cn(
                'rounded px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60',
              )
            }
          >
            {collapsed ? n.label.charAt(0) : n.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
