import { useId, useRef, useState, type KeyboardEvent, type ReactElement, type Ref } from 'react';
import { ArrowDown01Icon, Search01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Popover } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';
import { Icon } from './icon.tsx';
import { menuItemClass } from './menu.tsx';

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
   * A trigger of the caller's own, such as a `<Picker>` in a toolbar; it must pass on its props and ref.
   * Left out, the field is drawn like `Select` and takes its label, help and error from a `<Field>`.
   */
  children?: ReactElement;
  /** The default field's own name, when it isn't inside a `<Field>`. */
  'aria-label'?: string;
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
  children,
  'aria-label': ariaLabel,
  onBlur,
  ref,
}: ComboboxProps) {
  const field = useFieldControl();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listboxId = useId();
  const optionId = useId();
  const list = useRef<HTMLDivElement>(null);
  const shown = matching(options, query);
  const picked = options.find((option) => option.value === value);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setQuery('');
    // The list opens on the option already picked, so Enter keeps it.
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
  }

  function moveTo(index: number) {
    setActive(index);
    list.current?.querySelector(`#${CSS.escape(`${optionId}-${String(index)}`)}`)?.scrollIntoView({ block: 'nearest' });
  }

  function pick(option: ComboboxOption) {
    onValueChange(option.value);
    setOpen(false);
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
          align={align}
          sideOffset={4}
          collisionPadding={16}
          className={cn(
            'z-50 flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-65 origin-(--radix-popover-content-transform-origin) flex-col rounded-md border border-border bg-raised p-1.5 text-body text-foreground shadow-overlay',
            'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
          )}
        >
          <div className="relative flex items-center pb-1.5">
            <Icon
              icon={Search01Icon}
              aria-hidden
              className="pointer-events-none absolute start-3 text-muted-foreground"
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
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              className="h-10 w-full min-w-0 rounded-sm border border-control bg-raised ps-10 pe-3 text-body text-foreground placeholder:text-placeholder"
            />
          </div>
          <div
            ref={list}
            id={listboxId}
            role="listbox"
            aria-label={searchLabel}
            className="flex min-h-0 flex-col overflow-y-auto"
          >
            {shown.length === 0 ? (
              <p className="m-0 px-3 py-2 text-small text-muted-foreground">{emptyText}</p>
            ) : (
              shown.map((option, index) => {
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
                    className={menuItemClass}
                    onPointerMove={() => {
                      if (index !== active) setActive(index);
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
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
