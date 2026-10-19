import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Icon, type IconSvgElement } from './icon.tsx';

const tones = {
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  success: 'bg-success-subtle text-success',
  neutral: 'text-muted-foreground',
} as const;

export type NotificationTone = keyof typeof tones;

export type NotificationItemProps = Omit<ComponentProps<'li'>, 'title'> & {
  icon: IconSvgElement;
  /** Waiting on you, failing, done, or neither: the icon's circle, beside words that say the same. */
  tone: NotificationTone;
  title: string;
  /** The second line: `PROJ-1423 · Add bulk archive · npm test -- content-list`. */
  detail: ReactNode;
  /** "2 min ago". */
  time: string;
  unread: boolean;
  /** Opens the notification's place. The whole row answers a click; the title is the button. */
  onOpen: () => void;
  /** Buttons under the time, such as Allow once and Review; they sit above the row's own click. */
  actions?: ReactNode;
};

/**
 * Design system: `dh-notif` (spec 029). One row of the bell's panel: an icon in its tone, the title (a button named
 * "Title, unread" while unread, and described by the detail and the time), and an unread dot.
 */
export function NotificationItem({
  icon,
  tone,
  title,
  detail,
  time,
  unread,
  onOpen,
  actions,
  className,
  ...props
}: NotificationItemProps) {
  const id = useId();
  return (
    <li className={cn('relative flex gap-2.5 px-3.5 py-3 hover:bg-subtle', className)} {...props}>
      <span aria-hidden className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', tones[tone])}>
        <Icon icon={icon} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          type="button"
          aria-label={unread ? `${title}, unread` : title}
          aria-describedby={`${id}-detail ${id}-time`}
          onClick={onOpen}
          // Its ::after covers the row, so the whole row answers a click, as ListNav's items do.
          className="cursor-pointer pe-4.5 text-start font-medium after:absolute after:inset-0"
        >
          {title}
        </button>
        <span id={`${id}-detail`} className="text-small text-muted-foreground">
          {detail}
        </span>
        <span id={`${id}-time`} className="text-label text-muted-foreground">
          {time}
        </span>
        {actions === undefined ? null : <span className="relative mt-2 flex flex-wrap gap-2">{actions}</span>}
      </span>
      {unread ? <span aria-hidden className="absolute end-3.5 top-4.5 size-2 rounded-full bg-info" /> : null}
    </li>
  );
}
