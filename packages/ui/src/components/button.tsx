import type { ComponentProps, MouseEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

/**
 * Design system: Button (`dh-btn`). One `primary` per view; everything else is
 * `secondary` or `ghost`. Use `asChild` with a link when the button navigates.
 */
export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-transparent font-medium whitespace-nowrap no-underline disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-88',
        secondary: 'border-control bg-raised text-foreground hover:bg-subtle',
        ghost: 'bg-transparent text-foreground hover:bg-subtle',
        danger: 'bg-danger text-on-danger hover:opacity-88',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-small',
        icon: 'size-10 p-0',
        'icon-sm': 'size-8 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (for example a router link) with button styles. */
    asChild?: boolean;
    /**
     * Pass it to a button that stays on screen while its action runs. When true, the button shows
     * a spinner before its label and ignores presses, but keeps focus (`aria-disabled`, not
     * `disabled`). Passing it at all reserves the spinner's room, so the button never changes width.
     */
    pending?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  pending,
  children,
  onClick,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...(onClick === undefined ? {} : { onClick })}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      type={type ?? 'button'}
      {...(pending ? { 'aria-disabled': true } : {})}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        // Also stops a form's implicit submit, which presses its submit button.
        if (pending) event.preventDefault();
        else onClick?.(event);
      }}
      {...props}
    >
      {pending === undefined ? children : <PendingLabel pending={pending}>{children}</PendingLabel>}
    </button>
  );
}

/**
 * The label, with the spinner's room always kept by an invisible copy in the same grid cell, so
 * the button is as wide while it waits as before.
 */
function PendingLabel({ pending, children }: { pending: boolean; children: ButtonProps['children'] }) {
  return (
    <span className="grid justify-items-center">
      <span className="col-start-1 row-start-1 inline-flex items-center gap-2">
        {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : null}
        {children}
      </span>
      <span aria-hidden className="invisible col-start-1 row-start-1 inline-flex items-center gap-2">
        <LoaderCircle />
        {children}
      </span>
    </span>
  );
}
