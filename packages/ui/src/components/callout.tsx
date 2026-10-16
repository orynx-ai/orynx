import type { ComponentProps, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

const calloutVariants = cva('flex gap-3 rounded-md px-4 py-3', {
  variants: {
    tone: {
      warning: 'bg-warning-subtle text-foreground',
      info: 'bg-info-subtle text-info-foreground',
    },
  },
  defaultVariants: { tone: 'info' },
});

export type CalloutProps = Omit<ComponentProps<'div'>, 'title'> &
  VariantProps<typeof calloutVariants> & {
    /** Says what is happening: "Claude wants to run a command". */
    title: string;
    icon?: ReactNode;
    /** Buttons that say what each choice does: "Allow once", "Deny". */
    actions?: ReactNode;
  };

/**
 * Design system: Callout (`dh-callout`). An inline message in the flow of work, never a modal.
 * Pass `role="alert"` for approvals so screen readers announce them.
 */
export function Callout({ tone, title, icon, actions, className, children, ...props }: CalloutProps) {
  return (
    <div className={cn(calloutVariants({ tone }), className)} {...props}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className={cn('font-semibold', tone === 'warning' ? 'text-foreground' : 'text-info-foreground')}>
          {title}
        </span>
        {children}
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
