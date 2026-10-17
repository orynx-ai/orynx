import type { ComponentProps } from 'react';
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
  };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
