import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

/** Whether a {@link TooltipProvider} is already above, so a tooltip never needs one of its own. */
const ProvidedContext = createContext(false);

/**
 * Shares one timer between every tooltip below it: the first opens after the pointer rests 500 ms, and
 * moving straight on to the next opens that one at once (spec 020, Q1). The app puts one at its root; a
 * tooltip with none above brings its own, so a component works on its own too.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <ProvidedContext value>
      <TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
        {children}
      </TooltipPrimitive.Provider>
    </ProvidedContext>
  );
}

export interface TooltipProps {
  /**
   * The control's name in words. Null leaves the control without a tooltip, as when its words already
   * show (an expanded sidebar's places); the control stays the same element either way, so focus holds.
   */
  label: ReactNode;
  /** Where it opens; it moves to the other side when there's no room. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** For a story: open from the start. */
  defaultOpen?: boolean;
  /** The control. It must take a ref and pointer and focus handlers: a button, a link, or a component that passes them on. */
  children: ReactElement;
}

/**
 * Not in the design system; spec 020 Q1 draws it like a menu: `bg-raised`, a hairline, `radius-sm` and
 * the one shadow, in `text-small`, 8 px from its control and 8 px inside the window. From shadcn's
 * `tooltip` (Radix underneath): it opens when the pointer rests on the control or at once when the
 * control gets keyboard focus, closes on Escape, on a press or when focus leaves, and never opens for a
 * touch. Screen readers hear it as the control's description, so the control keeps its own name.
 */
export function Tooltip({ label, side = 'top', defaultOpen, children }: TooltipProps) {
  const provided = useContext(ProvidedContext);
  const off = label === null || label === undefined || label === false || label === '';
  const tooltip = (
    <TooltipPrimitive.Root {...(off ? { open: false } : defaultOpen === undefined ? {} : { defaultOpen })}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-slot="tooltip"
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="z-50 max-w-80 origin-(--radix-tooltip-content-transform-origin) rounded-sm border border-border bg-raised px-2 py-1 text-small text-foreground shadow-overlay motion-safe:data-[state=delayed-open]:animate-fade-in"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  return provided ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>;
}
