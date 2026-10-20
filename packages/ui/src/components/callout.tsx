import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';

// An alert or a notice fades in as it appears, so the change is seen.
const calloutVariants = cva('flex gap-3 rounded-md p-4 motion-safe:animate-fade-in', {
  variants: {
    tone: {
      warning: 'bg-warning-subtle text-foreground',
      info: 'bg-info-subtle text-info-foreground',
      /** Something failed and stopped the work: a session that couldn't start (spec 011, Q9f). */
      danger: 'bg-danger-subtle text-foreground',
      /** Something finished well, said where it happened: "Jira connected." (spec 030). */
      success: 'bg-success-subtle text-foreground',
    },
  },
  defaultVariants: { tone: 'info' },
});

const titleColour = {
  warning: 'text-foreground',
  info: 'text-info-foreground',
  danger: 'text-danger',
  success: 'text-foreground',
} as const;

export type CalloutProps = Omit<ComponentProps<'div'>, 'title'> &
  VariantProps<typeof calloutVariants> & {
    /** Says what is happening: "Claude wants to run a command". */
    title: string;
    icon?: ReactNode;
    /** Buttons that say what each choice does: "Allow once", "Deny". */
    actions?: ReactNode;
    /**
     * Gives the callout a close button at its end, for a notice the person may hide (spec 020). The
     * caller remembers the choice and moves focus on, since the button goes with the callout.
     */
    onClose?: () => void;
    /** The close button's words, in its tooltip and its name: "Hide this note". */
    closeLabel?: string;
  };

/**
 * Design system: Callout (`dh-callout`). An inline message in the flow of work, never a modal.
 * Pass `role="alert"` for approvals so screen readers announce them.
 */
export function Callout({
  tone,
  title,
  icon,
  actions,
  onClose,
  closeLabel = 'Close',
  className,
  children,
  ...props
}: CalloutProps) {
  return (
    <div className={cn(calloutVariants({ tone }), className)} {...props}>
      {icon ? <span className="mt-0.5 flex shrink-0">{icon}</span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className={cn('font-medium', titleColour[tone ?? 'info'])}>{title}</span>
        {children}
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {onClose ? (
        // Level with the title: the 32 px button reaches 6 px above and below its 20 px line.
        <IconButton variant="ghost" size="sm" label={closeLabel} className="-my-1.5 -me-1.5 shrink-0" onClick={onClose}>
          <Icon icon={Cancel01Icon} aria-hidden />
        </IconButton>
      ) : null}
    </div>
  );
}

export type CalloutCodeProps = Omit<ComponentProps<'pre'>, 'children'> & {
  /** Exactly what will run or change, as given: spacing and line breaks are kept. */
  children: string;
};

/**
 * The exact thing an approval is about, such as the command that will run (`dh-callout code`, spec 012
 * Q8a). Long lines wrap; past 12 lines the box scrolls, and can then be reached with Tab to scroll it.
 */
export function CalloutCode({ className, children, ...props }: CalloutCodeProps) {
  const box = useRef<HTMLPreElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const measure = () => {
      setScrolls(element.scrollHeight > element.clientHeight);
    };
    measure();
    // A narrower window or sidebar, or a late font, can make the same text scroll. At its full height the
    // box keeps its size while its text grows, so the text is watched as well.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild !== null) observer.observe(element.firstElementChild);
    return () => {
      observer.disconnect();
    };
  }, [children]);

  return (
    <pre
      ref={box}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling box must take focus to scroll by keyboard (axe: scrollable-region-focusable); one that fits stays out of the Tab order
      tabIndex={scrolls ? 0 : undefined}
      className={cn(
        // 12 lines of 20 px exactly, with the 6 px above and below and the border outside them.
        'm-0 box-content max-h-60 overflow-y-auto rounded-sm border border-border bg-raised px-2 py-1.5 font-mono text-code wrap-anywhere whitespace-pre-wrap text-foreground',
        className,
      )}
      {...props}
    >
      <code>{children}</code>
    </pre>
  );
}
