import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type DetailListProps = Omit<ComponentProps<'dl'>, 'children'> & {
  /** Each fact, in order: "Site" and "your-team.atlassian.net". */
  items: readonly { term: string; detail: ReactNode }[];
};

/**
 * Design system: details (`dh-kv`, spec 030). Terms in a column as wide as the widest, muted; each detail
 * beside its term, wrapping in its own column. Boxed in a hairline, as the connection dialog draws it.
 */
export function DetailList({ items, className, ...props }: DetailListProps) {
  return (
    <dl
      className={cn(
        'm-0 grid grid-cols-terms gap-x-3.5 gap-y-1 rounded-md border border-border px-3.5 py-3 text-small',
        className,
      )}
      {...props}
    >
      {items.map(({ term, detail }) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="m-0 min-w-0 break-words">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
