import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

const pillVariants = cva(
  'inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-label font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-subtle text-muted-foreground',
        info: 'bg-info-subtle text-info-foreground',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type PillTone = NonNullable<VariantProps<typeof pillVariants>['tone']>;

export type PillProps = ComponentProps<'span'> &
  VariantProps<typeof pillVariants> & {
    /** Drop the dot for tags that are not a status. */
    plain?: boolean;
  };

/**
 * Design system: Pill (`dh-pill`). A dot plus a word, so state never depends on colour alone.
 * neutral = to do; warning = in progress or waiting on you; info = in review; success = done; danger = failing.
 */
export function Pill({ tone, plain = false, className, children, ...props }: PillProps) {
  return (
    <span className={cn(pillVariants({ tone }), className)} {...props}>
      {plain ? null : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
