import { createContext, useContext, useState, type ComponentProps } from 'react';
import { Toggle as TogglePrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';

interface SegmentedControlContextValue {
  value: string | undefined;
  pick: (value: string) => void;
}

// An item outside a SegmentedControl shows as not pressed and does nothing.
const SegmentedControlContext = createContext<SegmentedControlContextValue>({
  value: undefined,
  pick: () => undefined,
});

export type SegmentedControlProps = Omit<ComponentProps<'div'>, 'defaultValue' | 'onChange'> & {
  /** What the options switch, for example "View". */
  'aria-label': string;
  /** The picked option, when the screen holds it. */
  value?: string | undefined;
  /** The option picked at first, when the control holds its own value. */
  defaultValue?: string | undefined;
  /** Called once when another option is picked; never for the option already picked. */
  onValueChange?: ((value: string) => void) | undefined;
};

/**
 * Design system: SegmentedControl (`dh-segmented`). Switches how the same items are shown, such as
 * Board or List. A named group of toggle buttons (`aria-pressed`), each with an icon and a word: Tab
 * reaches each one, and one is always pressed. Built from shadcn's `toggle`; not its `toggle-group`,
 * whose single-choice mode turns the options into radios that arrow keys pick (spec 006).
 */
export function SegmentedControl({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: SegmentedControlProps) {
  const [ownValue, setOwnValue] = useState(defaultValue);
  const current = value ?? ownValue;

  function pick(next: string) {
    if (next === current) return;
    if (value === undefined) setOwnValue(next);
    onValueChange?.(next);
  }

  return (
    <div
      role="group"
      data-slot="segmented-control"
      // Four options can be wider than a phone; the group then scrolls sideways, never the page.
      className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-sm bg-subtle p-0.75', className)}
      {...props}
    >
      <SegmentedControlContext value={{ value: current, pick }}>{children}</SegmentedControlContext>
    </div>
  );
}

export type SegmentedControlItemProps = Omit<
  ComponentProps<typeof TogglePrimitive.Root>,
  'pressed' | 'defaultPressed' | 'onPressedChange' | 'value'
> & {
  value: string;
  /** `danger` for an option that forbids something, such as Block: its word turns `danger` once pressed. */
  tone?: 'danger';
};

/** One option: an icon (`aria-hidden`) and a word. The pressed one sits on `bg-raised` with a hairline. */
export function SegmentedControlItem({ value, tone, className, onFocus, ...props }: SegmentedControlItemProps) {
  const { value: current, pick } = useContext(SegmentedControlContext);
  return (
    <TogglePrimitive.Root
      data-slot="segmented-control-item"
      pressed={current === value}
      // Only a press picks. Pressing the pressed option asks to unpress it, which is ignored, so one
      // option always stays pressed.
      onPressedChange={(pressed) => {
        if (pressed) pick(value);
      }}
      // The group can scroll sideways on a phone; bring the option Tab lands on into view.
      onFocus={(event) => {
        onFocus?.(event);
        event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }}
      className={cn(
        // The group can scroll, which clips anything outside it, so the focus ring is drawn inside the option (as in Tabs).
        // Pressed by `aria-pressed`: a Tooltip around an option sets its own `data-state` (spec 031).
        'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border-0 bg-transparent px-3 text-small font-medium whitespace-nowrap text-muted-foreground focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:bg-raised aria-pressed:text-foreground aria-pressed:ring-1 aria-pressed:ring-border',
        tone === 'danger' && 'aria-pressed:text-danger',
        className,
      )}
      {...props}
    />
  );
}
