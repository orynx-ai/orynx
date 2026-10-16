import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-subtle text-label font-semibold text-foreground',
  {
    variants: { size: { default: 'size-6', lg: 'size-7' } },
    defaultVariants: { size: 'default' },
  },
);

export type AvatarProps = Omit<ComponentProps<'span'>, 'children'> &
  VariantProps<typeof avatarVariants> & {
    initials: string;
    /** Who this is, for example "Assigned to you". Leave it out when a name is already shown next to it. */
    label?: string;
  };

/** Design system: Avatar (`dh-avatar`). Initials in a circle. */
export function Avatar({ initials, label, size, className, ...props }: AvatarProps) {
  return (
    <span
      className={cn(avatarVariants({ size }), className)}
      {...(label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': true })}
      {...props}
    >
      {initials}
    </span>
  );
}
