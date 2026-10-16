import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type EmptyStateProps = Omit<ComponentProps<'div'>, 'title'> & {
  /** What would be here, in a few words: "Nothing in review". */
  title: string;
  /** How it gets here, or "Clear filters" when filters are why it is empty. */
  action?: ReactNode;
};

/** Design system: EmptyState (`dh-empty`). One short title, one line of help, a dashed outline. */
export function EmptyState({ title, action, className, children, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 rounded-md border border-dashed border-border px-2 py-4 text-center text-small text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span className="font-medium text-foreground">{title}</span>
      {children}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
