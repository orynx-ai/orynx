import { useEffect, useRef, type ComponentProps } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Skeleton } from './skeleton.tsx';

/** Scrolls the tab list sideways, and only it, until `tab` is fully in view. */
function scrollIntoList(tab: HTMLElement): void {
  const list = tab.parentElement;
  if (list === null) return;
  const tabBox = tab.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  if (tabBox.left < listBox.left) list.scrollLeft -= listBox.left - tabBox.left;
  else if (tabBox.right > listBox.right) list.scrollLeft += tabBox.right - listBox.right;
}

/**
 * Design system: Tabs (`dh-tabs`). For different content inside one page. Radix gives the
 * roles, aria-selected and arrow-key movement (roving tabindex). For two views of the same
 * items (Board / List) use a segmented control instead.
 */
export function Tabs({ ref, value, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  const root = useRef<HTMLDivElement | null>(null);

  // Whenever the picked tab changes, by a click, an arrow key, the address or Back, it is shown in full
  // in a tab list that scrolls sideways (Settings at 360 px). On the next frame: on Back, TanStack
  // Router puts every scrolled element back where it was after this render, the tab list included.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const picked = root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (picked) scrollIntoList(picked);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <TabsPrimitive.Root
      ref={(element) => {
        root.current = element;
        if (typeof ref === 'function') return ref(element);
        if (ref) ref.current = element;
        return undefined;
      }}
      {...(value === undefined ? {} : { value })}
      {...props}
    />
  );
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List className={cn('flex gap-6 overflow-x-auto border-b border-border', className)} {...props} />
  );
}

export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  /**
   * Shown after the label, e.g. the number of items in that tab. `null` while it's on its way: a blank
   * bubble keeps its room, so the tabs don't move when it arrives (spec 007 Q11d).
   */
  count?: number | null;
};

export function TabsTrigger({ className, count, children, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // The list scrolls sideways, which clips anything outside it, so the focus ring is drawn inside the tab.
        'relative inline-flex h-12 cursor-pointer items-center gap-2 border-0 bg-transparent px-0.5 font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:-outline-offset-2 aria-selected:text-foreground',
        'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-info after:opacity-0 aria-selected:after:opacity-100',
        className,
      )}
      {...props}
    >
      {children}
      {typeof count === 'number' ? ' ' : null}
      {typeof count === 'number' ? (
        <span className="rounded-full bg-subtle px-1.5 text-label font-medium text-muted-foreground">{count}</span>
      ) : count === null ? (
        <Skeleton shape="circle" className="h-4 w-6" />
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

/** Radix makes the panel focusable, so it keeps the shared focus ring. */
export function TabsContent(props: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content {...props} />;
}
