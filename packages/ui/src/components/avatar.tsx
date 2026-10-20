import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-subtle text-label font-medium text-foreground',
  {
    variants: { size: { default: 'size-7', lg: 'size-9', xl: 'size-16 text-title', '2xl': 'size-24 text-title-lg' } },
    defaultVariants: { size: 'default' },
  },
);

export type AvatarProps = Omit<ComponentProps<'span'>, 'children'> &
  VariantProps<typeof avatarVariants> & {
    initials: string;
    /** A picture of the person, drawn in place of the initials. */
    src?: string | null | undefined;
    /** Who this is, for example "Assigned to you". Leave it out when a name is already shown next to it. */
    label?: string;
  };

/** Design system: Avatar (`dh-avatar`). Initials, or the person's picture, in a circle. */
export function Avatar({ initials, src, label, size, className, ...props }: AvatarProps) {
  return (
    <span
      className={cn(avatarVariants({ size }), className)}
      {...(label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': true })}
      {...props}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials}
    </span>
  );
}
