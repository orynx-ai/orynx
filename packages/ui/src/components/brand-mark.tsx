import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

export type BrandMarkProps = Omit<ComponentProps<'svg'>, 'children' | 'viewBox'>;

/**
 * Orynx's mark: two pills and the slanted stroke between them (the user's brand, 18 Oct 2026).
 * Drawn in the text colour, so it is near-black on light and near-white on dark. The mark is
 * decorative; the name "Orynx" is always written next to it.
 */
export function BrandMark({ className, ...props }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 100 63.77"
      aria-hidden
      focusable="false"
      fill="currentColor"
      className={cn('h-5 w-8 shrink-0', className)}
      {...props}
    >
      <rect x="0" y="11.45" width="22.91" height="48.81" rx="11.46" />
      <path d="M49.08 3.62L70.73 25.26A4.51 4.51 0 0 1 72.05 28.45L72.05 61.49A2.01 2.01 0 0 1 68.54 62.82L31.07 20.6A12.38 12.38 0 0 1 49.08 3.62Z" />
      <rect x="78.31" y="13.88" width="21.69" height="49.89" rx="10.85" />
    </svg>
  );
}
