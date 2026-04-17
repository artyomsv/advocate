import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, JSX } from 'react';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        default: 'bg-slate-800 text-slate-200',
        success: 'bg-green-900 text-green-200',
        warn: 'bg-amber-900 text-amber-100',
        danger: 'bg-red-900 text-red-100',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
