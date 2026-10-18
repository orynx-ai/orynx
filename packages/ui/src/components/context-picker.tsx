import { useId, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Popover } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton, type IconButtonProps } from './icon-button.tsx';
import { menuItemClass } from './menu.tsx';

/**
 * Design system: the Composer's + button (`dh-menu` in `home.html`, spec 015). One popup that shows the kinds
 * of context Claude can work from, then, in the same place, a searchable list of one kind with a Back button.
 * The page holds which view is open: `<ContextPickerContent view="kinds">` with `<ContextKindItem>`s, or
 * `view="list"` with a `<ContextSearch>`. Radix Popover underneath: Esc closes it, and focus goes back to +.
 */
export function ContextPicker(props: ComponentProps<typeof Popover.Root>) {
  return <Popover.Root {...props} />;
}

export type ContextPickerTriggerProps = Omit<IconButtonProps, 'label' | 'children'> & {
  /** Its name and tooltip; "Add context". */
  label?: string;
};

/** The ghost + in the Composer's bar. It opens the kinds, which are a menu. */
export function ContextPickerTrigger({ label = 'Add context', ...props }: ContextPickerTriggerProps) {
  return (
    <Popover.Trigger asChild aria-haspopup="menu">
      <IconButton variant="ghost" size="sm" label={label} {...props}>
        <Icon icon={PlusSignIcon} aria-hidden />
      </IconButton>
    </Popover.Trigger>
  );
}

export type ContextPickerContentProps = ComponentProps<typeof Popover.Content> & {
  /** `kinds` is a menu of `<ContextKindItem>`s; `list` is a dialog around a `<ContextSearch>`. */
  view: 'kinds' | 'list';
  /** One quiet line at the foot of the kinds ("Tip: …"), which also describes the menu. */
  foot?: ReactNode;
};

const kindSelector = '[role="menuitem"]';

/** ↓ ↑ Home End move between the kinds, round from the last to the first. */
function moveBetweenKinds(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(kindSelector)];
  if (items.length === 0) return;
  event.preventDefault();
  const at = items.findIndex((item) => item === document.activeElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}

/**
 * The popup: `bg-raised`, a hairline, `radius-md` and the one shadow, as Menu draws it. 330 px for the kinds and
 * 350 px for a list (`home.html`), never wider than the room the window has, keeping 16 px from its edges.
 * The kinds open with focus on the first of them.
 */
export function ContextPickerContent({
  view,
  foot,
  className,
  children,
  onKeyDown,
  onOpenAutoFocus,
  ...props
}: ContextPickerContentProps) {
  const footId = useId();
  const kinds = view === 'kinds';
  return (
    <Popover.Portal>
      <Popover.Content
        data-slot="context-picker"
        align="start"
        sideOffset={4}
        collisionPadding={16}
        role={kinds ? 'menu' : 'dialog'}
        aria-describedby={kinds && foot ? footId : undefined}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented || !kinds) return;
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(kindSelector)?.focus();
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (kinds && !event.defaultPrevented) moveBetweenKinds(event);
        }}
        className={cn(
          'z-50 flex max-h-(--radix-popover-content-available-height) max-w-(--radix-popover-content-available-width) origin-(--radix-popover-content-transform-origin) flex-col rounded-md border border-border bg-raised p-1.5 text-body text-foreground shadow-overlay',
          'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
          kinds ? 'w-82.5 overflow-y-auto' : 'w-87.5',
          className,
        )}
        {...props}
      >
        {children}
        {kinds && foot ? (
          <div id={footId} className="mt-1 border-t border-border px-2 pt-1.5 pb-0.5 text-small text-muted-foreground">
            {foot}
          </div>
        ) : null}
      </Popover.Content>
    </Popover.Portal>
  );
}

/** The kinds' heading: 14 px in `text-secondary`, as MenuLabel. Arrow keys skip it. */
export function ContextPickerLabel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-2 pt-1.5 pb-1 text-small text-muted-foreground', className)} {...props} />;
}

export type ContextKindItemProps = Omit<ComponentProps<'button'>, 'onSelect'> & {
  /** The tool's mark, or a quieter icon (`text-muted-foreground`), as `home.html` draws them. */
  icon?: ReactNode;
  /** One line under the name, cut off with an ellipsis. */
  description?: ReactNode;
  /** Picking it leads on to a list, so it shows a chevron. */
  leadsOn?: boolean;
  onSelect?: () => void;
};

/**
 * One kind: a 40 px row like Menu's, with Menu's 4 px ink bar while the keyboard or the pointer is on it. Only
 * the arrow keys reach the others, so Tab leaves the menu.
 */
export function ContextKindItem({
  icon,
  description,
  leadsOn = false,
  onSelect,
  className,
  children,
  ...props
}: ContextKindItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-slot="context-kind"
      className={cn(
        menuItemClass,
        'hover:bg-subtle hover:before:opacity-100 focus:bg-subtle focus:before:opacity-100',
        className,
      )}
      onClick={onSelect}
      {...props}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        {children}
        {description ? <span className="truncate text-small text-muted-foreground">{description}</span> : null}
      </span>
      {leadsOn ? <Icon icon={ArrowRight01Icon} aria-hidden className="ms-auto text-muted-foreground" /> : null}
    </button>
  );
}
