import {
  Bot,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Settings as SettingsIcon,
  Users,
  Zap,
} from 'lucide-react';
import type { ComponentType, JSX } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui.store';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

const NAV: readonly NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/queue', label: 'Queue', icon: Inbox },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/tasks', label: 'Tasks', icon: KanbanSquare },
  { to: '/legends', label: 'Legends', icon: Users },
  { to: '/llm', label: 'LLM', icon: Zap },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar(): JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <aside
      className={cn(
        'glass flex flex-col gap-1 rounded-none border-y-0 border-l-0 p-2',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className={cn('px-3 py-3 text-sm font-medium tracking-wider', collapsed && 'text-center px-0')}>
        {collapsed ? 'M' : 'MYNAH'}
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-[var(--accent-muted)] text-[var(--fg)]'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--fg)]',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded bg-[var(--color-accent)]" />
                )}
                <Icon size={16} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
