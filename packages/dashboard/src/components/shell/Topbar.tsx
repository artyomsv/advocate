import { Menu, Power } from 'lucide-react';
import type { JSX } from 'react';
import { useAuth } from 'react-oidc-context';
import { useUiStore } from '../../stores/ui.store';
import { ProductSwitcher } from './ProductSwitcher';
import { ThemeToggle } from './ThemeToggle';

export function Topbar(): JSX.Element {
  const auth = useAuth();
  const toggle = useUiStore((s) => s.toggleSidebar);
  const username = auth.user?.profile.preferred_username ?? '—';

  return (
    <header className="glass sticky top-0 z-20 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-3 py-2">
      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--fg-muted)] hover:bg-[var(--glass-hover)]"
        title="Toggle sidebar"
      >
        <Menu size={18} />
      </button>

      <ProductSwitcher />

      <div className="flex-1" />

      <ThemeToggle />

      <span className="text-sm text-[var(--fg-muted)]">{username}</span>

      <button
        type="button"
        onClick={() => void auth.signoutRedirect()}
        className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--fg-muted)] hover:bg-red-500/15 hover:text-red-400"
        title="Log out"
      >
        <Power size={18} />
      </button>
    </header>
  );
}
