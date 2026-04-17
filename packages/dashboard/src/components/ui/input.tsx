import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm',
        'text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none',
        'focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--accent-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
