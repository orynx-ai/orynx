import type { ComponentProps } from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root>;

/**
 * Design system: `dh-switch` (spec 029, Settings › Notifications and the bell's panel). Radix Switch: a button with
 * `role="switch"` that Space and Enter flip. It has no words of its own, so name it with `aria-label`, or with
 * `aria-labelledby` or a `<label htmlFor>` pointing at its row's title. On, it takes the ink, as the design's accent.
 */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-control p-0.5 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-info',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-raised data-[state=checked]:translate-x-4 motion-safe:transition-transform" />
    </SwitchPrimitive.Root>
  );
}
