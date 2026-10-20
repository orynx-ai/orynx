import type { ReactNode } from 'react';
import { Icon, type IconProps } from '@devhub/ui';

/**
 * A Settings section's heading with its icon, and one quiet line under it, as the Coding agent redesign draws them.
 * `action` sits at the end, and wraps under them on a narrow window.
 */
export function SectionHeading({
  id,
  icon,
  title,
  line,
  action,
}: {
  id: string;
  icon: IconProps['icon'];
  title: string;
  line?: ReactNode;
  action?: ReactNode;
}) {
  const heading = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h2 id={id} className="m-0 flex items-center gap-2 text-body font-medium">
        <Icon icon={icon} aria-hidden className="text-muted-foreground" />
        {title}
      </h2>
      {line === undefined ? null : <p className="m-0 text-small text-muted-foreground">{line}</p>}
    </div>
  );
  if (action === undefined) return heading;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2.5">
      <div className="flex-1 basis-60">{heading}</div>
      {action}
    </div>
  );
}
