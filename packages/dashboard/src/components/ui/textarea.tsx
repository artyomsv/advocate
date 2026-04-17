import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-[80px] w-full rounded border border-[var(--glass-border)] bg-transparent px-3 py-2 text-sm',
      'text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none resize-y',
      'focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--accent-ring)]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
