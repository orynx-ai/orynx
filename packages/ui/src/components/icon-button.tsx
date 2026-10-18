import { Loading03Icon } from '@hugeicons/core-free-icons';
import { Button, type ButtonProps } from './button.tsx';
import { Icon } from './icon.tsx';
import { Tooltip, type TooltipProps } from './tooltip.tsx';

export type IconButtonProps = Omit<ButtonProps, 'size' | 'pending'> & {
  /**
   * What the button does, in words: its tooltip, and its name unless `aria-label` says which item it acts
   * on ("Ship", named "Ship PROJ-1423"). Required, so an icon never stands alone (spec 020).
   */
  label: string;
  /** 40 px, or 32 px in dense rows. */
  size?: 'default' | 'sm';
  /** Where the tooltip opens; beside a rail icon, `right`. */
  tooltipSide?: TooltipProps['side'];
  /**
   * While its action runs: a spinner takes the icon's place and presses are ignored, but the button keeps
   * focus (`aria-disabled`, not `disabled`).
   */
  pending?: boolean;
};

/**
 * Design system: Button (`dh-btn--icon`) with the words it lacks in a {@link Tooltip}. Every icon-only
 * button is one of these (`pnpm gate icon-buttons`); its children are the icon, or with `asChild`, the
 * link that holds the icon.
 */
export function IconButton({
  label,
  size = 'default',
  tooltipSide,
  pending = false,
  asChild = false,
  'aria-label': name,
  onClick,
  children,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip label={label} side={tooltipSide}>
      <Button
        size={size === 'sm' ? 'icon-sm' : 'icon'}
        asChild={asChild}
        aria-label={name ?? label}
        {...(pending ? { 'aria-disabled': true, 'aria-busy': true } : {})}
        onClick={(event) => {
          // Also stops a form's implicit submit, which presses its submit button.
          if (pending) event.preventDefault();
          else onClick?.(event);
        }}
        {...props}
      >
        {pending && !asChild ? (
          <Icon icon={Loading03Icon} aria-hidden className="motion-safe:animate-spin" />
        ) : (
          children
        )}
      </Button>
    </Tooltip>
  );
}
