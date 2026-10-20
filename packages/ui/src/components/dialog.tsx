import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';

export type DialogProps = ComponentProps<typeof DialogPrimitive.Root>;

/**
 * A dialog over the page, such as ⌘K search (spec 009, Q3a). From shadcn's `dialog` (Radix underneath):
 * focus moves in and stays in, Esc or a click outside closes it, and focus goes back to what had it
 * before, a trigger or a field the person was typing in.
 */
export function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/** Names the dialog. Every dialog has one; hide it with `sr-only` when the dialog's own content says enough. */
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title data-slot="dialog-title" className={cn('text-title font-medium', className)} {...props} />
  );
}

/**
 * The dialog's buttons (`dh-dialog-foot`, spec 030): a hairline above, the sidebar's tint, the actions at the
 * end with Cancel first and the primary last. `start` holds one action that sits apart, such as Disconnect.
 */
export function DialogFoot({ start, className, children, ...props }: ComponentProps<'div'> & { start?: ReactNode }) {
  return (
    <div
      data-slot="dialog-foot"
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-border bg-sidebar px-5 py-3.5',
        className,
      )}
      {...props}
    >
      {start === undefined ? null : <div className="me-auto">{start}</div>}
      {children}
    </div>
  );
}

export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /**
   * `full` fills the window, keeping the 16 px gutter on every side at every width, for reading a whole diff.
   * `narrow` is 520 px, for a dialog about one thing, such as a tool's connection (spec 030). `wide` is up to
   * 1100 × 860 px, as tall as it may be from the first, for a list beside its detail such as Sync activity
   * (spec 035).
   */
  size?: 'default' | 'narrow' | 'wide' | 'full';
};

/**
 * The dialog itself, in a portal: `bg-raised`, a hairline, `radius-lg` (the design system's radius for
 * dialogs) and the one shadow. It is the narrow page measure wide (720 px), 80 px from the top of the
 * window and as tall as its content, up to the window's height less 80 px above and below. Under 768 px
 * it fills the width with the 16 px gutter, 16 px from the top. Past its height it doesn't scroll: give
 * the part that should scroll `min-h-0 overflow-y-auto`.
 *
 * Behind it, the page fades towards the canvas (`bg-canvas` at 70%, the user's call, 19 Oct 2026: the
 * design system has no backdrop token) and doesn't scroll while it's open; the dialog's own content still
 * does. Both fade in with the shared `animate-fade-in`, unless the person asks for reduced motion.
 */
export function DialogContent({
  size = 'default',
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  // Radix gives focus back to a trigger only. Opened by a key (⌘K) there is none, so remember what had it.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      {/* Radix locks the page's scroll while its overlay is there. */}
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-canvas/70 motion-safe:animate-fade-in"
      />
      {/* Lays the dialog out over the window; clicks pass through it, so a click beside the dialog closes it. */}
      <div
        className={cn(
          'pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-4',
          size !== 'full' && 'md:py-20',
        )}
      >
        <DialogPrimitive.Content
          data-slot="dialog"
          // Nothing describes it unless the caller says so; Radix would otherwise warn.
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            onOpenAutoFocus?.(event);
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            const target = returnFocusTo.current;
            if (event.defaultPrevented || target?.isConnected !== true) return;
            event.preventDefault();
            target.focus();
          }}
          className={cn(
            'pointer-events-auto flex max-h-full w-full max-w-180 flex-col overflow-hidden rounded-lg border border-border bg-raised text-body text-foreground shadow-overlay outline-none motion-safe:animate-fade-in max-md:max-w-none',
            size === 'narrow' && 'max-w-130',
            size === 'wide' && 'h-full max-h-215 max-w-275',
            size === 'full' && 'h-full max-w-none',
            className,
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}
