import type { JSX, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function MetricCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('glass p-5', className)}>
      <div className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">{label}</div>
      <div className="mt-1 text-3xl font-medium">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--fg-subtle)]">{hint}</div>}
    </div>
  );
}
