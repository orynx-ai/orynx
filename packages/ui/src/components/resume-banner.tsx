import type { ComponentProps, ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from './button.tsx';

export type ResumeBannerProps = Omit<ComponentProps<'a'>, 'title' | 'children'> & {
  /** What's happening: "Claude is waiting for your approval". */
  title: ReactNode;
  /** One line about which session and why: "PROJ-1423 · Add bulk archive · wants to run npm test". */
  detail: ReactNode;
  /** The word drawn as a button at the end. */
  action?: ReactNode;
  /** Render the child link (the router's) as the banner. */
  asChild?: boolean;
  children?: ComponentProps<'a'>['children'];
};

/**
 * Design system: resume banner (`dh-resume`). A session waiting on you, on top of Home: the "!"
 * icon, what's happening, which session and why, and "Review". The whole banner is one link to the
 * session, so it takes one Tab stop and is read as its words; "Review" only looks like a button.
 * On hover a `warning` ring traces it.
 */
export function ResumeBanner({
  title,
  detail,
  action = 'Review',
  asChild = false,
  className,
  children,
  ...props
}: ResumeBannerProps) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      data-slot="resume-banner"
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-md bg-warning-subtle px-3.5 py-3 text-foreground no-underline hover:ring-1 hover:ring-warning',
        className,
      )}
      {...props}
    >
      {/* The sidebar's "Needs you" circle, on bg-raised so it stands out from the banner. */}
      <span
        aria-hidden
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-raised text-warning"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          className="lucide size-3.5 stroke-2"
        >
          <path d="M12 7v6" />
          <path d="M12 17h.01" />
        </svg>
      </span>
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>{' '}
        <span className="truncate text-small text-muted-foreground">{detail}</span>
      </span>{' '}
      <span className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}>{action}</span>
    </Comp>
  );
}
