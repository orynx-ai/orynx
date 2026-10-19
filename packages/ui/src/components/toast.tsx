import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Icon, type IconSvgElement } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import { notificationTones, type NotificationTone } from './notification-item.tsx';

export type ToastProps = Omit<ComponentProps<'div'>, 'title' | 'role'> & {
  icon: IconSvgElement;
  tone: NotificationTone;
  title: string;
  detail: ReactNode;
  /** An approval interrupts (`alert`, spec 029 AC-23, CLAUDE.md rule 7); anything else waits its turn (`status`). */
  role: 'alert' | 'status';
  /** Opens the notification's place; the title is the button. */
  onOpen: () => void;
  onClose: () => void;
  /** Buttons under the detail, such as Allow once and Review. */
  actions?: ReactNode;
};

/**
 * Design system: `dh-toast` (spec 029): a pop-up in the corner while Orynx is open, 380 px wide, or the window's
 * width at 360 px. A warning one, Claude waiting on you, has a warning outline (`dh-toast--warning`). The page
 * decides when it goes, and passes `onMouseEnter` and `onFocus` to hold it while you're on it.
 */
export function Toast({ icon, tone, title, detail, role, onOpen, onClose, actions, className, ...props }: ToastProps) {
  const id = useId();
  return (
    <div
      role={role}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-detail`}
      className={cn(
        'pointer-events-auto flex w-full gap-2.5 rounded-md border bg-raised p-3.5 text-foreground shadow-overlay motion-safe:animate-fade-in sm:w-95',
        tone === 'warning' ? 'border-warning' : 'border-border',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', notificationTones[tone])}
      >
        <Icon icon={icon} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          id={`${id}-title`}
          type="button"
          onClick={onOpen}
          className="cursor-pointer text-start font-medium hover:underline"
        >
          {title}
        </button>
        <span id={`${id}-detail`} className="text-small text-muted-foreground">
          {detail}
        </span>
        {actions === undefined ? null : <span className="mt-2 flex flex-wrap gap-2">{actions}</span>}
      </span>
      <IconButton variant="ghost" size="sm" label="Close" className="-me-1.5 -mt-1.5" onClick={onClose}>
        <Icon icon={Cancel01Icon} aria-hidden />
      </IconButton>
    </div>
  );
}

/** Where pop-ups stack: the window's bottom-right corner, newest at the bottom (spec 029, Q2). */
export function ToastRegion({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      aria-label="Pop-ups"
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:start-auto',
        className,
      )}
      {...props}
    />
  );
}
