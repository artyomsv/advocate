import type { JSX, LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Label({
  className,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }): JSX.Element {
  return (
    <label
      className={cn('text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]', className)}
      {...props}
    >
      {children}
    </label>
  );
}
