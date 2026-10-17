import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn.ts';

export type PickerProps = ComponentProps<'button'> & {
  /** A lucide icon, or the agent's status dot, before the choice. */
  icon?: ReactNode;
};

/**
 * Design system: picker (`dh-picker`). A 32 px button showing the current choice (the folder, the
 * agent) that opens a Menu: put it in `<MenuTrigger asChild>`, which says it opens a menu and
 * whether it's open. The chevron says so to the eye.
 */
export function Picker({ icon, type, className, children, ...props }: PickerProps) {
  return (
    <button
      data-slot="picker"
      type={type ?? 'button'}
      className={cn(
        'inline-flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-raised px-2.5 text-small font-medium text-foreground hover:bg-subtle aria-expanded:bg-subtle',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      <ChevronDown aria-hidden />
    </button>
  );
}
