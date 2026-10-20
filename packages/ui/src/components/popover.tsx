import type { ComponentProps } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';

/**
 * A panel that opens beside its trigger, such as DatePicker's calendar (spec 037). From shadcn's `popover` (Radix
 * underneath), drawn as a menu is: `bg-raised`, a hairline, `radius-md` and the one shadow. Esc or a click outside
 * closes it, and focus goes back to the trigger.
 */
export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 4,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-50 origin-(--radix-popover-content-transform-origin) rounded-md border border-border bg-raised p-3 text-body text-foreground shadow-overlay outline-none',
          'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
