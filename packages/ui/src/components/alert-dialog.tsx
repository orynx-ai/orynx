import type { ComponentProps } from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Button, type ButtonProps } from './button.tsx';
import { DialogFoot } from './dialog.tsx';

/**
 * A confirmation that interrupts, before something that can't be undone, such as Delete ticket (spec 037). From
 * shadcn's `alert-dialog` (Radix underneath), restyled as Dialog's narrow size: Cancel has focus first, so Enter
 * never confirms by accident; Esc cancels, a click outside doesn't; focus goes back to what opened it.
 */
export function AlertDialog(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

export function AlertDialogTrigger(props: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

/** The confirmation itself, 520 px wide (Dialog's `narrow`), over the page faded towards the canvas. */
export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-50 bg-canvas/70 motion-safe:animate-fade-in"
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-4 md:py-20">
        <AlertDialogPrimitive.Content
          data-slot="alert-dialog"
          className={cn(
            'pointer-events-auto flex max-h-full w-full max-w-130 flex-col overflow-hidden rounded-lg border border-border bg-raised text-body text-foreground shadow-overlay outline-none motion-safe:animate-fade-in max-md:max-w-none',
            className,
          )}
          {...props}
        />
      </div>
    </AlertDialogPrimitive.Portal>
  );
}

/** The title and what it does, above the buttons. */
export function AlertDialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-body" className={cn('flex flex-col gap-2 p-6', className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-title font-medium', className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('m-0 text-muted-foreground', className)}
      {...props}
    />
  );
}

/** The buttons, as Dialog's foot: Cancel first, the action last, at the end. */
export const AlertDialogFooter = DialogFoot;

/** Closes it and does nothing else. */
export function AlertDialogCancel({ variant = 'secondary', ...props }: ButtonProps) {
  return (
    <AlertDialogPrimitive.Cancel asChild>
      <Button variant={variant} {...props} />
    </AlertDialogPrimitive.Cancel>
  );
}

/**
 * Does the thing, in `danger` unless said otherwise. It closes the confirmation as it's pressed; for work that
 * takes a moment, call `event.preventDefault()` in `onClick`, show `pending`, and close it when the work is done.
 */
export function AlertDialogAction({ variant = 'danger', ...props }: ButtonProps) {
  return (
    <AlertDialogPrimitive.Action asChild>
      <Button variant={variant} {...props} />
    </AlertDialogPrimitive.Action>
  );
}
