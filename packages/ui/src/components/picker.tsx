import type { ComponentProps, ReactNode } from 'react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';

const pickerVariants = cva(
  'group inline-flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm border text-small text-foreground enabled:hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-45 aria-expanded:bg-subtle',
  {
    variants: {
      variant: {
        default: 'border-border bg-raised px-2.5 font-medium',
        // A row of filters over a list, as the Orynx look draws them (18 Oct 2026): words, a count, a chevron.
        plain: 'border-transparent bg-transparent px-2',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type PickerProps = ComponentProps<'button'> &
  VariantProps<typeof pickerVariants> & {
    /** A lucide icon, or the agent's status dot, before the choice. */
    icon?: ReactNode;
    /**
     * How many of its options are picked, in a filled ink bubble after the words; nothing at 0. With
     * the name as plain text, a screen reader hears it after a middle dot: "Status · 1".
     */
    count?: number;
  };

/**
 * Design system: picker (`dh-picker`). A 32 px button showing the current choice (the folder, the
 * agent) that opens a Menu: put it in `<MenuTrigger asChild>`, which says it opens a menu and
 * whether it's open. The chevron says so to the eye, and turns over while the menu is open. With
 * nothing to offer, pass `disabled` to the trigger: the picker then takes the Button's disabled look
 * (spec 007 Q11b). `plain` drops the box, for a row of filters.
 */
export function Picker({ icon, count, variant, type, className, children, ...props }: PickerProps) {
  const counted = count !== undefined && count > 0;
  // One string, so every browser reads the same name; a caller's own aria-label still wins.
  const named = counted && typeof children === 'string';
  return (
    <button
      data-slot="picker"
      type={type ?? 'button'}
      className={cn(pickerVariants({ variant }), className)}
      aria-label={named ? `${children} · ${String(count)}` : undefined}
      {...props}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {counted ? (
        <span
          aria-hidden={named}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-label font-medium text-primary-foreground"
        >
          {count}
        </span>
      ) : null}
      <Icon
        icon={ArrowDown01Icon}
        aria-hidden
        className="group-aria-expanded:rotate-180 motion-safe:transition-transform"
      />
    </button>
  );
}
