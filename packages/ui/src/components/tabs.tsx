import type { ComponentProps } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';

/**
 * Design system: Tabs (`dh-tabs`). For different content inside one page. Radix gives the
 * roles, aria-selected and arrow-key movement (roving tabindex). For two views of the same
 * items (Board / List) use a segmented control instead.
 */
export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List className={cn('flex gap-6 overflow-x-auto border-b border-border', className)} {...props} />
  );
}

export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** Shown after the label, e.g. the number of items in that tab. */
  count?: number;
};

export function TabsTrigger({ className, count, children, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex h-12 cursor-pointer items-center gap-2 border-0 bg-transparent px-0.5 font-medium whitespace-nowrap text-muted-foreground hover:text-foreground aria-selected:text-foreground',
        'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-info after:opacity-0 aria-selected:after:opacity-100',
        className,
      )}
      {...props}
    >
      {children}
      {count === undefined ? null : ' '}
      {count === undefined ? null : (
        <span className="rounded-full bg-subtle px-1.5 text-label font-medium text-muted-foreground">{count}</span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none', className)} {...props} />;
}
