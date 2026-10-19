import type { Ref } from 'react';
import { Combobox } from './combobox.tsx';
import { Menu, MenuCheckboxItem, MenuContent, MenuTrigger, type MenuSize } from './menu.tsx';
import { Picker } from './picker.tsx';

export interface FilterMenuOption {
  value: string;
  label: string;
}

export interface FilterMenuProps {
  /** The filter's name, on its picker and at the top of its options: "Status". */
  label: string;
  options: readonly FilterMenuOption[];
  /** The values ticked now. */
  ticked: readonly string[];
  onTickedChange: (ticked: string[]) => void;
  /** As Menu's `size`. */
  size?: MenuSize;
  /**
   * A search box over the options, named and placeheld by this ("Search people"), for a long list such as
   * Assignee (the user's call, 19 Oct 2026). The options then open as Combobox's checkboxes.
   */
  searchLabel?: string;
  /** With `searchLabel`: the line when nothing matches the search ("No one matches"). */
  emptyText?: string;
  /** The picker, so a page can put focus on it (Clear filters). */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * One filter over a list (Home's filters, spec 007 Q10c; Tickets', spec 020): its name in a plain picker with
 * how many options are ticked, opening its options as checkboxes under its name. Ticking keeps the menu open.
 * With nothing to offer, the picker is disabled (spec 007 Q11b).
 */
export function FilterMenu({
  label,
  options,
  ticked,
  onTickedChange,
  size,
  searchLabel,
  emptyText = '',
  ref,
}: FilterMenuProps) {
  const picker = (
    <Picker ref={ref} variant="plain" count={ticked.length}>
      {label}
    </Picker>
  );
  if (searchLabel !== undefined) {
    return (
      <Combobox
        options={options}
        values={ticked}
        onValuesChange={onTickedChange}
        searchLabel={searchLabel}
        emptyText={emptyText}
        disabled={options.length === 0}
        {...(size === undefined ? {} : { size })}
      >
        {picker}
      </Combobox>
    );
  }
  return (
    <Menu>
      {/* Radix reads `disabled` on the trigger. */}
      <MenuTrigger asChild disabled={options.length === 0}>
        {picker}
      </MenuTrigger>
      <MenuContent heading={label} {...(size === undefined ? {} : { size })}>
        {options.map((option) => (
          <MenuCheckboxItem
            key={option.value}
            checked={ticked.includes(option.value)}
            onCheckedChange={(on) => {
              onTickedChange(on ? [...ticked, option.value] : ticked.filter((value) => value !== option.value));
            }}
          >
            {option.label}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
