import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from '@hugeicons/react';
import { cn } from '../lib/cn.ts';

export type { IconSvgElement };

export type IconProps = Omit<HugeiconsIconProps, 'size' | 'strokeWidth' | 'color'>;

/**
 * One icon from Hugeicons' free set (`@hugeicons/core-free-icons`), the Orynx icon family (the user's
 * call, 18 Oct 2026): `<Icon icon={Home03Icon} />`. Drawn in the text colour at 20 px with a 1.5 stroke,
 * the same everywhere, so pass no size or stroke; `className` may resize it (`size-4`). Decorative:
 * the words beside it, or the control's `aria-label`, carry the meaning. Reach for lucide-react only
 * when Hugeicons has no match.
 */
export function Icon({ className, ...props }: IconProps) {
  return (
    <HugeiconsIcon
      aria-hidden
      focusable="false"
      strokeWidth={1.5}
      color="currentColor"
      className={cn('icon', className)}
      {...props}
    />
  );
}
