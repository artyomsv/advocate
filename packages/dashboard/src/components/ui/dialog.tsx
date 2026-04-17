import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { type ComponentProps, type JSX, type ReactNode, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof DialogPrimitive.Content> & { title?: string }
>(({ className, title, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'glass fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-6',
        className,
      )}
      {...props}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        {title ? (
          <DialogPrimitive.Title className="text-lg font-medium">{title}</DialogPrimitive.Title>
        ) : (
          <div />
        )}
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--fg-muted)] hover:bg-[var(--glass-hover)]"
          >
            <X size={16} />
          </button>
        </DialogPrimitive.Close>
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export function DialogBody({ children }: { children: ReactNode }): JSX.Element {
  return <div className="space-y-4">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }): JSX.Element {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}
