import type { ReactNode } from 'react';
import { Icon, type IconProps } from '@devhub/ui';

/** A Settings section's heading with its icon, and one quiet line under it, as the Coding agent redesign draws them. */
export function SectionHeading({
  id,
  icon,
  title,
  line,
}: {
  id: string;
  icon: IconProps['icon'];
  title: string;
  line?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={id} className="m-0 flex items-center gap-2 text-body font-medium">
        <Icon icon={icon} aria-hidden className="text-muted-foreground" />
        {title}
      </h2>
      {line === undefined ? null : <p className="m-0 text-small text-muted-foreground">{line}</p>}
    </div>
  );
}
