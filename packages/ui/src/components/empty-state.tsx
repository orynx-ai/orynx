import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type EmptyStateProps = Omit<ComponentProps<'div'>, 'title'> & {
  /** What would be here, in a few words: "Nothing in review". */
  title: string;
  /** How it gets here, or "Clear filters" when filters are why it is empty. */
  action?: ReactNode;
};

/**
 * Design system: EmptyState (`dh-empty`). One short title and one line of help, as plain centred
 * text: no border, no icon, no card (Clean UI). An action only when the reader can act from here.
 */
export function EmptyState({ title, action, className, children, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center gap-1 px-4 py-8 text-center text-muted-foreground', className)}
      {...props}
    >
      <span className="font-medium text-foreground">{title}</span>
      {children}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
