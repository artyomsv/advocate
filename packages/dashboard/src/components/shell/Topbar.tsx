import type { JSX } from 'react';
import { useAuth } from 'react-oidc-context';
import { useUiStore } from '../../stores/ui.store';

export function Topbar(): JSX.Element {
  const auth = useAuth();
  const toggle = useUiStore((s) => s.toggleSidebar);
  const username = auth.user?.profile.preferred_username ?? '—';

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
      <button
        type="button"
        onClick={toggle}
        className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800"
      >
        ☰
      </button>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-400">{username}</span>
        <button
          type="button"
          onClick={() => void auth.signoutRedirect()}
          className="rounded border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
