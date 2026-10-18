import type { Ref } from 'react';
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
  /** The picker, so a page can put focus on it (Clear filters). */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * One filter over a list (Home's filters, spec 007 Q10c; Tickets', spec 020): its name in a plain picker with
 * how many options are ticked, opening its options as checkboxes under its name. Ticking keeps the menu open.
 * With nothing to offer, the picker is disabled (spec 007 Q11b).
 */
export function FilterMenu({ label, options, ticked, onTickedChange, size, ref }: FilterMenuProps) {
  return (
    <Menu>
      {/* Radix reads `disabled` on the trigger. */}
      <MenuTrigger asChild disabled={options.length === 0}>
        <Picker ref={ref} variant="plain" count={ticked.length}>
          {label}
        </Picker>
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
