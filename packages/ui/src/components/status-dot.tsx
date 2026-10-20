import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

export type StatusDotTone = 'success' | 'warning' | 'danger' | 'off';

const tones: Record<StatusDotTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  off: 'border border-control',
};

export type StatusDotProps = Omit<ComponentProps<'span'>, 'children'> & { tone: StatusDotTone };

/**
 * Design: Sync activity (spec 035 Q4). An 8 px dot for how something stands: worked, needs attention, failed,
 * or off as an empty ring. Always decorative: the words beside it, or a screen-reader line, say the state.
 */
export function StatusDot({ tone, className, ...props }: StatusDotProps) {
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tones[tone], className)} {...props} />;
}
