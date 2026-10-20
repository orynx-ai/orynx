import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type StatTilesProps = Omit<ComponentProps<'dl'>, 'children'> & {
  /** Each figure, in order: "Next sync" and "10:46". */
  items: readonly { term: string; detail: ReactNode }[];
};

/**
 * Design: Sync activity's stats (spec 035 Q4). Figures side by side in tiles at least 150 px wide, as many to a
 * row as fit, split by hairlines inside one rounded box. Each tile is its name, muted, over its value.
 */
export function StatTiles({ items, className, ...props }: StatTilesProps) {
  return (
    <dl
      className={cn(
        'm-0 grid grid-cols-tiles gap-px overflow-hidden rounded-md border border-border bg-border',
        className,
      )}
      {...props}
    >
      {items.map(({ term, detail }) => (
        <div key={term} className="flex flex-col gap-1 bg-raised px-3.5 py-3">
          <dt className="text-label text-muted-foreground">{term}</dt>
          <dd className="m-0 font-medium">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
