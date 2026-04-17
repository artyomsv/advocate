import type { JSX, ReactNode } from 'react';
import { Label } from './label';

export function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {hint && !error && <div className="text-xs text-[var(--fg-subtle)]">{hint}</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
