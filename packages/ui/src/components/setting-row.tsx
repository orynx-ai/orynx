import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/** Design system: `dh-panel` around `dh-perm` rows (spec 029, Settings › Notifications): one bordered list. */
export function SettingList({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('divide-y divide-border rounded-md border border-border bg-raised', className)} {...props} />
  );
}

export type SettingRowProps = Omit<ComponentProps<'div'>, 'title'> & {
  title: ReactNode;
  /** The title's id, for a switch or a group named by it (`aria-labelledby`). */
  titleId?: string;
  /** Makes the title a `<label>` for this control's id, such as the volume slider. */
  titleFor?: string;
  description?: ReactNode;
  /** The row's control at its end: a switch, or a picker and a switch. */
  control?: ReactNode;
};

/**
 * Design system: `dh-perm` (spec 029). A setting's title, its one-line description and anything under it (a pill,
 * a checkbox, a slider) on the left, its control at the end. When the words would get narrower than 192 px, as a
 * picker and a switch at 360 px make them, the control moves under them.
 */
export function SettingRow({
  title,
  titleId,
  titleFor,
  description,
  control,
  className,
  children,
  ...props
}: SettingRowProps) {
  const Title = titleFor === undefined ? 'span' : 'label';
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5', className)} {...props}>
      <div className="flex min-w-48 flex-1 flex-col gap-0.5">
        <Title id={titleId} htmlFor={titleFor} className="font-medium">
          {title}
        </Title>
        {description === undefined ? null : <span className="text-small text-muted-foreground">{description}</span>}
        {children}
      </div>
      {control === undefined ? null : <div className="flex shrink-0 items-center gap-3">{control}</div>}
    </div>
  );
}
