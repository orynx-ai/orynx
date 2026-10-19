import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

export type FloatingBarProps = ComponentProps<'div'> & {
  /** Names the bar's group of actions: "Selected tickets". */
  'aria-label': string;
};

/**
 * A rounded pill that floats at the bottom centre of the window, over the page, with what's picked and what to do
 * with it (the user's call for Tickets, 19 Oct 2026): `bg-raised`, a hairline and the one overlay shadow, holding
 * `sm` buttons. It keeps 16 px from the window's edges and fades in. The page keeps room at its end so the bar
 * never hides the last row.
 */
export function FloatingBar({ className, ...props }: FloatingBarProps) {
  return (
    <div
      role="group"
      data-slot="floating-bar"
      className={cn(
        'fixed inset-x-4 bottom-4 z-20 mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border border-border bg-raised p-1.5 ps-4 shadow-overlay motion-safe:animate-fade-in',
        className,
      )}
      {...props}
    />
  );
}

/** A hairline between the bar's groups of actions, as tall as an `sm` button's words (the user's call, 19 Oct 2026). */
export function FloatingBarSeparator({ className, ...props }: Omit<ComponentProps<'span'>, 'children'>) {
  return (
    <span
      aria-hidden
      data-slot="floating-bar-separator"
      className={cn('h-5 w-px shrink-0 bg-border', className)}
      {...props}
    />
  );
}
