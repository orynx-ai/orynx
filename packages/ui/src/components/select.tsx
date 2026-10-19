import type { ComponentProps } from 'react';
import { ArrowDown01Icon, ArrowUp01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Select as SelectPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';
import { Icon } from './icon.tsx';
import { menuItemClass } from './menu.tsx';

/**
 * Design system: Select. Pick one of a list, from shadcn's `select` (Radix underneath; the user's call for Settings ›
 * Notifications, 19 Oct 2026): arrow keys, typeahead, Enter to pick, Esc to close and focus back on the trigger.
 * `<Select value onValueChange disabled>` around `<SelectTrigger><SelectValue /></SelectTrigger>` and
 * `<SelectContent>` with `<SelectItem value>`s.
 */
export function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

/** The picked option's words, inside the trigger. */
export function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

/**
 * The closed select, drawn like `Input`: 40 px, the `border-control` outline, the chevron at the end. Put it inside
 * `<Field>` for its label, help and error; on its own give it an `aria-label`. `className` sizes it.
 */
export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  const field = useFieldControl();
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-sm border border-control bg-raised px-3 text-start text-body whitespace-nowrap text-foreground not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger data-placeholder:text-muted-foreground *:data-[slot=select-value]:truncate',
        className,
      )}
      {...props}
      {...(field
        ? { id: field.id, 'aria-describedby': field.describedBy, 'aria-invalid': field.invalid || undefined }
        : {})}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <Icon icon={ArrowDown01Icon} aria-hidden className="shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

const scrollButtonClass = 'flex cursor-default items-center justify-center py-1 text-muted-foreground';

/**
 * The open list, in a portal, drawn as Menu's: `bg-raised`, a hairline, `radius-md` and the one shadow, at least as
 * wide as its trigger. It opens under the trigger, flips above when there's no room, keeps 16 px from the window's
 * edges, and a long list scrolls inside it, with arrows at its ends.
 */
export function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 4,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'relative z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-hidden rounded-md border border-border bg-raised text-body text-foreground shadow-overlay',
          'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className={scrollButtonClass}>
          <Icon icon={ArrowUp01Icon} aria-hidden />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport
          className={cn(
            'p-1.5',
            position === 'popper' && 'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className={scrollButtonClass}>
          <Icon icon={ArrowDown01Icon} aria-hidden />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

/** One option: Menu's 40 px row, with a tick at its end while it's the picked one. */
export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={cn(menuItemClass, 'pe-9', className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute end-3 inline-flex">
        <Icon icon={Tick02Icon} aria-hidden className="text-primary" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
