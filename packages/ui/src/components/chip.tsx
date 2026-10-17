import type { ComponentProps } from 'react';
import { Slot, Toggle as TogglePrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';

/** `dh-chip`: 32 px, fully round, a hairline on `bg-raised`; its icon is quieter than its words. */
const chipBase =
  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-raised px-3 text-small whitespace-nowrap text-foreground no-underline hover:bg-subtle [&>svg]:text-muted-foreground';

export type ChipProps = ComponentProps<'button'> & {
  /** Render the child element (a router link) with chip styles. */
  asChild?: boolean;
};

/**
 * Design system: chip (`dh-chip`), as Home's quick starts use it: one click to start something
 * ("Pick up a ticket"). From AI Elements' Suggestion pattern, drawn as the design system's chip.
 * A link when it goes somewhere (`asChild`), a button when it acts.
 */
export function Chip({ asChild = false, type, className, ...props }: ChipProps) {
  if (asChild) return <Slot.Root data-slot="chip" className={cn(chipBase, className)} {...props} />;
  return <button data-slot="chip" type={type ?? 'button'} className={cn(chipBase, className)} {...props} />;
}

export type FilterChipProps = ComponentProps<typeof TogglePrimitive.Root>;

/**
 * Design system: chip (`dh-chip`) as a toolbar filter ("Assigned to me"). A toggle button that says
 * whether it's pressed; pressed, it takes the `info` wash, words and border.
 */
export function FilterChip({ className, ...props }: FilterChipProps) {
  return (
    <TogglePrimitive.Root
      data-slot="filter-chip"
      className={cn(
        chipBase,
        'data-[state=on]:border-info data-[state=on]:bg-info-subtle data-[state=on]:text-info-foreground',
        className,
      )}
      {...props}
    />
  );
}
