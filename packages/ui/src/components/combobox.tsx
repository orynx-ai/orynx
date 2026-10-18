import { useId, useRef, useState, type KeyboardEvent, type ReactElement, type Ref } from 'react';
import { ArrowDown01Icon, Search01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Popover } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';
import { Icon } from './icon.tsx';
import { menuItemClass } from './menu.tsx';
import { Skeleton } from './skeleton.tsx';

export interface ComboboxOption {
  value: string;
  /** What the option says, and what the search matches with its value: "MOB · Mobile". */
  label: string;
}

export interface ComboboxProps {
  options: readonly ComboboxOption[];
  /** The picked option's value; one no option has shows `placeholder`. */
  value: string;
  onValueChange: (value: string) => void;
  /** The search box's name for screen readers, and its placeholder: "Search Jira projects". */
  searchLabel: string;
  /** The line shown when nothing matches the search: "No projects match". */
  emptyText: string;
  /** The field's words when no option is picked. */
  placeholder?: string;
  disabled?: boolean;
  /** Where the list lines up with the field: `start` under a form field, `end` under a toolbar picker. */
  align?: 'start' | 'end';
  /**
   * `sm`, as Menu's (spec 020): 32 px rows and search box in `text-small`, 256 px wide and at most 360 px
   * tall, for a toolbar's picker.
   */
  size?: 'default' | 'sm';
  /** The options are still on their way: two loading rows the size of real ones follow those already here. */
  loading?: boolean;
  /**
   * A trigger of the caller's own, such as a `<Picker>` in a toolbar; it must pass on its props and ref.
   * Left out, the field is drawn like `Select` and takes its label, help and error from a `<Field>`.
   */
  children?: ReactElement;
  /** The default field's own name, when it isn't inside a `<Field>`. */
  'aria-label'?: string;
  /** Told when the list opens or closes, such as to ask for options only once someone looks. */
  onOpenChange?: (open: boolean) => void;
  /** For a story: open from the start. */
  defaultOpen?: boolean;
  /** For react-hook-form's `Controller`: called when the field loses focus with the list closed. */
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
}

/** The options whose words or value hold the search, in any case. */
function matching(options: readonly ComboboxOption[], query: string): ComboboxOption[] {
  const words = query.trim().toLowerCase();
  if (words === '') return [...options];
  return options.filter(
    (option) => option.label.toLowerCase().includes(words) || option.value.toLowerCase().includes(words),
  );
}

/**
 * Not in the design system; the user asked for it on 18 Oct 2026 (spec 020, AC-37). A field drawn like
 * `Select` that opens a list drawn like a `Menu`, with a search box over it: typing narrows the options by
 * their words or value, ↓ and ↑ move, Enter picks, and Escape closes it with focus back on the field. From
 * shadcn's combobox pattern on Radix Popover, without cmdk: the search box is the ARIA combobox, and the
 * active option is its `aria-activedescendant`, as `SearchPalette` does it.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  searchLabel,
  emptyText,
  placeholder = '',
  disabled = false,
  align = 'start',
  size = 'default',
  loading = false,
  children,
  'aria-label': ariaLabel,
  onOpenChange,
  defaultOpen = false,
  onBlur,
  ref,
}: ComboboxProps) {
  const field = useFieldControl();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  // Null until the person moves or types: the option already picked, even when the options arrive after the
  // list opened, so Enter keeps it.
  const [moved, setMoved] = useState<number | null>(null);
  const listboxId = useId();
  const optionId = useId();
  const list = useRef<HTMLDivElement>(null);
  const shown = matching(options, query);
  const active =
    moved ??
    Math.max(
      0,
      shown.findIndex((option) => option.value === value),
    );
  const small = size === 'sm';
  const picked = options.find((option) => option.value === value);

  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) return;
    setQuery('');
    setMoved(null);
  }

  function moveTo(index: number) {
    setMoved(index);
    list.current?.querySelector(`#${CSS.escape(`${optionId}-${String(index)}`)}`)?.scrollIntoView({ block: 'nearest' });
  }

  function pick(option: ComboboxOption) {
    onValueChange(option.value);
    changeOpen(false);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      moveTo((active + step + shown.length) % shown.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (shown.length > 0) moveTo(event.key === 'Home' ? 0 : shown.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = shown[active];
      if (option !== undefined) pick(option);
    }
  }

  const trigger = children ?? (
    <button
      type="button"
      data-slot="combobox"
      className="relative flex h-10 w-full min-w-0 cursor-pointer items-center rounded-sm border border-control bg-raised ps-3 pe-10 text-start text-body text-foreground not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger"
      aria-label={ariaLabel}
      {...(field
        ? { id: field.id, 'aria-describedby': field.describedBy, 'aria-invalid': field.invalid || undefined }
        : {})}
    >
      <span className={cn('min-w-0 truncate', picked === undefined && 'text-placeholder')}>
        {picked?.label ?? placeholder}
      </span>
      <Icon icon={ArrowDown01Icon} aria-hidden className="pointer-events-none absolute end-3 text-muted-foreground" />
    </button>
  );

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger
        asChild
        ref={ref}
        disabled={disabled}
        aria-haspopup="listbox"
        onBlur={() => {
          if (!open) onBlur?.();
        }}
      >
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-slot="combobox-list"
          // Radix draws it as a dialog, which needs a name: the search it holds.
          aria-label={searchLabel}
          align={align}
          sideOffset={4}
          collisionPadding={16}
          className={cn(
            'z-50 flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-65 origin-(--radix-popover-content-transform-origin) flex-col rounded-md border border-border bg-raised p-1.5 text-body text-foreground shadow-overlay',
            'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
            small && 'max-h-90 w-64 min-w-0 p-1 text-small',
          )}
        >
          <div className={cn('relative flex items-center', small ? 'pb-1' : 'pb-1.5')}>
            <Icon
              icon={Search01Icon}
              aria-hidden
              className={cn(
                'pointer-events-none absolute text-muted-foreground',
                small ? 'start-2.5 size-4' : 'start-3',
              )}
            />
            <input
              type="search"
              role="combobox"
              aria-label={searchLabel}
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={shown.length === 0 ? undefined : `${optionId}-${String(active)}`}
              placeholder={searchLabel}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMoved(0);
              }}
              onKeyDown={onSearchKeyDown}
              className={cn(
                'w-full min-w-0 rounded-sm border border-control bg-raised pe-3 text-foreground placeholder:text-placeholder',
                small ? 'h-8 ps-8 text-small' : 'h-10 ps-10 text-body',
              )}
            />
          </div>
          {/* The listbox holds options alone (ARIA), so the no-match line and the loading rows sit beside it. */}
          <div ref={list} className="flex min-h-0 flex-col overflow-y-auto">
            <div
              id={listboxId}
              role="listbox"
              aria-label={searchLabel}
              aria-busy={loading || undefined}
              className="flex flex-col"
            >
              {shown.map((option, index) => {
                const selected = option.value === value;
                return (
                  // The keyboard reaches options from the search box (↓ ↑ Enter, aria-activedescendant), as
                  // ARIA's combobox pattern asks, so an option takes no focus or keys of its own.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- see above
                  <div
                    key={option.value}
                    id={`${optionId}-${String(index)}`}
                    role="option"
                    aria-selected={selected}
                    data-highlighted={index === active ? '' : undefined}
                    className={cn(menuItemClass, small && 'min-h-8 py-1')}
                    onPointerMove={() => {
                      if (index !== active) setMoved(index);
                    }}
                    // Keeps focus in the search box, so the list stays open until the click picks.
                    onPointerDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      pick(option);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {selected ? <Icon icon={Tick02Icon} aria-hidden className="shrink-0" /> : null}
                  </div>
                );
              })}
            </div>
            {shown.length === 0 && !loading ? (
              <p className="m-0 px-3 py-2 text-small text-muted-foreground">{emptyText}</p>
            ) : null}
            {loading ? (
              // Rows the size of real ones, so the list doesn't jump when the options arrive.
              <div role="status" className="flex flex-col">
                <span className="sr-only">Loading</span>
                {[0, 1].map((row) => (
                  <span key={row} aria-hidden className={cn('flex items-center px-3', small ? 'h-8' : 'h-10')}>
                    <Skeleton className="h-3.5 w-3/4" />
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
