import { X } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { useEffect } from 'react';
import { cn } from '../../lib/cn';

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  width = 'w-[480px]',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  width?: string;
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-label="Close drawer"
      />
      <aside
        className={cn(
          'glass absolute right-0 top-0 h-full overflow-y-auto rounded-none border-y-0 border-r-0 p-6',
          width,
        )}
        style={{ animation: 'drawer-in 200ms ease-out' }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          {title ? <h2 className="text-lg font-medium">{title}</h2> : <div />}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--fg-muted)] hover:bg-[var(--glass-hover)]"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </aside>
      <style>{`
        @keyframes drawer-in {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
