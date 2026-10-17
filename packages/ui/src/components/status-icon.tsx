import type { ComponentProps, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

export type StatusIconStatus = 'todo' | 'in_progress' | 'in_review' | 'done';

const iconVariants = cva('size-5 shrink-0 fill-none stroke-current stroke-2', {
  variants: {
    status: {
      todo: 'text-muted-foreground',
      in_progress: 'text-warning',
      in_review: 'text-info',
      done: 'text-success',
    },
  },
});

/** The shapes the Tickets design draws: a dashed ring, then a ring filling up, then a check. */
const shapes: Record<StatusIconStatus, ReactNode> = {
  todo: <circle cx="12" cy="12" r="8" strokeDasharray="3.2 3" />,
  in_progress: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" stroke="none" />
    </>
  ),
  in_review: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7a5 5 0 1 1-5 5h5z" fill="currentColor" stroke="none" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
      <polyline points="8 12.5 11 15.5 16 9.5" className="stroke-raised" />
    </>
  ),
};

export type StatusIconProps = Omit<ComponentProps<'svg'>, 'children'> & {
  status: StatusIconStatus;
  /** The status in words, when no word sits next to the icon. Leave it out beside a column name. */
  label?: string;
};

/**
 * Design system: status icon (`dh-status-icon`). The shape carries the state, so it reads without
 * colour: to do, in progress, in review, done. 20 px, drawn in the status colour. Decorative next
 * to a column name; give it a `label` when it stands alone.
 */
export function StatusIcon({ status, label, className, ...props }: StatusIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(iconVariants({ status }), className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...props}
    >
      {shapes[status]}
    </svg>
  );
}
