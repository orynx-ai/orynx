import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft01Icon, ArrowRight01Icon, PlusSignIcon, Search01Icon } from '@hugeicons/core-free-icons';
import { Popover } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton, type IconButtonProps } from './icon-button.tsx';
import { menuItemClass, OptionMark } from './menu.tsx';
import { Skeleton } from './skeleton.tsx';

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
 * The kinds open with focus on the first of them, and Back from a list brings focus to the kind it came from.
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
  const content = useRef<HTMLDivElement | null>(null);
  // The kind a list was opened from, by its place, and the view shown before this one.
  const lastKind = useRef(0);
  const [shown, setShown] = useState(view);
  if (shown !== view) setShown(view);
  useEffect(() => {
    if (shown !== 'kinds') return;
    content.current?.querySelectorAll<HTMLElement>(kindSelector)[lastKind.current]?.focus();
  }, [shown]);
  return (
    <Popover.Portal>
      <Popover.Content
        ref={content}
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
        onClickCapture={(event) => {
          const kind = (event.target as HTMLElement).closest(kindSelector);
          if (kind === null) return;
          lastKind.current = [...event.currentTarget.querySelectorAll(kindSelector)].indexOf(kind);
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

/** One option of a kind's list. */
export interface ContextSearchOption {
  value: string;
  /** What it's called: `PROJ-1423`, `web-app #2836`, a folder's name. */
  label: string;
  /** One quiet line under it, cut off with an ellipsis: its title and status, or a folder's path. */
  description?: string | undefined;
  /** The tool's mark or an icon before it. */
  mark?: ReactNode | undefined;
  /** Already added, so its checkbox is ticked, or its radio picked (spec 015, AC-9). */
  added?: boolean | undefined;
}

/**
 * How the options are picked, each leading with its box (the user's call, 19 Oct 2026): `many` ticks and unticks
 * checkboxes and the page keeps the list open, as for tickets and pull requests; `one` picks a radio, as for a
 * folder.
 */
export type ContextSearchSelect = 'one' | 'many';

export interface ContextSearchProps {
  /** The kind: "Jira ticket". The list is named by it too. */
  title: string;
  /** Quiet words at the head's far end: "9 open". */
  count?: string | undefined;
  backLabel?: string | undefined;
  onBack: () => void;
  /** The search box's name and placeholder: "Search tickets by key or title". */
  searchLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** The options as the page has narrowed them by `query`. */
  options: readonly ContextSearchOption[];
  /** `one` by default. */
  select?: ContextSearchSelect | undefined;
  onPick: (value: string) => void;
  /** Said when nothing matches: "No matches. Try a key like PROJ-1423 or a repo name." */
  emptyText: string;
  /** The options are still on their way: three loading rows the size of real ones (Q15a). */
  loading?: boolean | undefined;
  /** One line in place of the search and the list, such as the tool not being connected (Q15a). */
  notice?: ReactNode | undefined;
  /** One action under the list, after a hairline: "Add local folder…". */
  extra?: { label: string; icon?: ReactNode; onSelect: () => void } | undefined;
  /** What Claude will see from this kind, in the foot (`dh-menu-foot`). It also describes the search box. */
  note: ReactNode;
}

/**
 * One kind's list (`dh-menu-head`, a search box, `dh-menu-item`s, `dh-menu-foot`), inside
 * `<ContextPickerContent view="list">`. The search box is the ARIA combobox, as Combobox's is: typing narrows
 * the options, ↓ ↑ Home End move, and Enter picks the marked one. It takes focus when the list opens.
 */
export function ContextSearch({
  title,
  count,
  backLabel = 'Back to all context types',
  onBack,
  searchLabel,
  query,
  onQueryChange,
  options,
  select = 'one',
  onPick,
  emptyText,
  loading = false,
  notice,
  extra,
  note,
}: ContextSearchProps) {
  const [active, setActive] = useState(0);
  const listboxId = useId();
  const optionId = useId();
  const noteId = useId();
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const marked = Math.min(active, Math.max(0, options.length - 1));

  useEffect(() => {
    search.current?.focus();
  }, []);

  function moveTo(index: number) {
    setActive(index);
    list.current?.querySelector(`#${CSS.escape(`${optionId}-${String(index)}`)}`)?.scrollIntoView({ block: 'nearest' });
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      moveTo((marked + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (options.length > 0) moveTo(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[marked];
      if (option !== undefined) onPick(option.value);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5 px-0.5 pb-1.5 font-medium">
        <IconButton variant="ghost" size="sm" label={backLabel} onClick={onBack}>
          <Icon icon={ArrowLeft01Icon} aria-hidden />
        </IconButton>
        <span className="min-w-0 truncate">{title}</span>
        {count === undefined ? null : (
          <span className="ms-auto shrink-0 text-small font-normal text-muted-foreground">{count}</span>
        )}
      </div>
      {notice === undefined ? (
        <>
          <div className="relative flex items-center px-0.5 pb-1.5">
            <Icon
              icon={Search01Icon}
              aria-hidden
              className="pointer-events-none absolute start-3.5 size-4 text-muted-foreground"
            />
            <input
              ref={search}
              type="search"
              role="combobox"
              aria-label={searchLabel}
              aria-describedby={noteId}
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={options.length === 0 ? undefined : `${optionId}-${String(marked)}`}
              placeholder={searchLabel}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                onQueryChange(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              className="h-8 w-full min-w-0 rounded-sm border border-control bg-raised ps-9 pe-3 text-body text-foreground placeholder:text-placeholder"
            />
          </div>
          {/* The listbox holds options alone (ARIA) and scrolls them; the empty line and loading rows sit under it. */}
          <div
            ref={list}
            id={listboxId}
            role="listbox"
            aria-label={title}
            aria-multiselectable={select === 'many'}
            aria-busy={loading || undefined}
            className="flex min-h-0 flex-col overflow-y-auto"
          >
            {options.map((option, index) => (
              // The keyboard reaches options from the search box (↓ ↑ Enter, aria-activedescendant), as ARIA's
              // combobox pattern asks, so an option takes no focus or keys of its own.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- see above
              <div
                key={option.value}
                id={`${optionId}-${String(index)}`}
                role="option"
                aria-selected={option.added === true}
                data-highlighted={index === marked ? '' : undefined}
                className={menuItemClass}
                onPointerMove={() => {
                  if (index !== marked) setActive(index);
                }}
                // Keeps focus in the search box until the click picks.
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onPick(option.value);
                }}
              >
                <OptionMark select={select} picked={option.added === true} />
                {option.mark}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.description === undefined ? null : (
                    <span className="truncate text-small text-muted-foreground">{option.description}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {options.length === 0 && !loading ? (
            <p className="m-0 px-2 py-3 text-small text-muted-foreground">{emptyText}</p>
          ) : null}
          {loading ? (
            <div role="status" className="flex shrink-0 flex-col">
              <span className="sr-only">Loading</span>
              {[0, 1, 2].map((row) => (
                <span key={row} aria-hidden className="flex h-10 items-center px-3">
                  <Skeleton className="h-3.5 w-3/4" />
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="m-0 px-2 py-3 text-small text-muted-foreground">{notice}</p>
      )}
      {extra === undefined ? null : (
        <>
          <div role="separator" className="my-1.5 h-px shrink-0 bg-border" />
          <button
            type="button"
            className={cn(
              menuItemClass,
              'hover:bg-subtle hover:before:opacity-100 focus-visible:bg-subtle focus-visible:before:opacity-100',
            )}
            onClick={extra.onSelect}
          >
            {extra.icon}
            {extra.label}
          </button>
        </>
      )}
      <div id={noteId} className="mt-1 border-t border-border px-2 pt-1.5 pb-0.5 text-small text-muted-foreground">
        {note}
      </div>
    </>
  );
}
