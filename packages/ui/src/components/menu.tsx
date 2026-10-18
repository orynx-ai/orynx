import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { ArrowRight01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { DropdownMenu as MenuPrimitive, Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';

/** Lets the content close its own menu (Tab); Radix keeps the open state inside the root. */
const SetOpenContext = createContext<(open: boolean) => void>(() => undefined);

export type MenuProps = ComponentProps<typeof MenuPrimitive.Root>;

/**
 * Design system: Menu (`dh-menu`). A short list of choices opened from a picker or a "more" button.
 * From shadcn's `dropdown-menu` (Radix underneath): roles, arrow keys, typeahead, Enter to pick, Esc
 * to close, and focus back on the trigger. Tab also closes it, as the design system's keyboard rules
 * ask; Radix on its own would keep focus in the menu.
 */
export function Menu({ open, defaultOpen = false, onOpenChange, ...props }: MenuProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  function setOpen(next: boolean) {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  }
  return (
    <SetOpenContext value={setOpen}>
      <MenuPrimitive.Root open={open ?? ownOpen} onOpenChange={setOpen} {...props} />
    </SetOpenContext>
  );
}

export function MenuTrigger(props: ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />;
}

export type MenuContentProps = ComponentProps<typeof MenuPrimitive.Content> & {
  /**
   * The menu's name, shown at its top over a hairline, as a filter's options draw it ("Workspace").
   * It also names the menu, in place of an `aria-label`.
   */
  heading?: string;
  /** One quiet line under the items ("Tip: …"). It also describes the menu, so screen readers hear it. */
  foot?: ReactNode;
};

/**
 * The menu itself, in a portal: `bg-raised`, a hairline, `radius-md` and the one shadow. It opens
 * under its trigger, flips above when there's no room below, keeps 16 px from the window's edges,
 * and scrolls inside itself when it's taller than the window (spec 006 Q4e). It grows out of its
 * trigger in 150 ms and fades out in 100 ms (the user's call for the Orynx brand, 18 Oct 2026).
 * Give it an `aria-label` or a `heading` when the trigger's words don't name it ("Repository" for a picker).
 */
export function MenuContent({
  className,
  heading,
  foot,
  align = 'start',
  sideOffset = 4,
  collisionPadding = 16,
  onKeyDown,
  children,
  ...props
}: MenuContentProps) {
  const setOpen = useContext(SetOpenContext);
  const footId = useId();
  const headingId = useId();
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="menu"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        // Named by its heading or its own label when it has one, rather than by the trigger's words.
        {...(heading === undefined ? {} : { 'aria-labelledby': headingId })}
        {...(props['aria-label'] === undefined || heading !== undefined ? {} : { 'aria-labelledby': undefined })}
        aria-describedby={foot ? footId : undefined}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key !== 'Tab' || event.defaultPrevented) return;
          event.preventDefault();
          setOpen(false);
        }}
        className={cn(
          'z-50 flex max-h-(--radix-dropdown-menu-content-available-height) max-w-(--radix-dropdown-menu-content-available-width) min-w-65 origin-(--radix-dropdown-menu-content-transform-origin) flex-col overflow-y-auto rounded-md border border-border bg-raised p-1.5 text-body text-foreground shadow-overlay',
          'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
          className,
        )}
        {...props}
      >
        {heading === undefined ? null : (
          // Stays at the top while the options scroll under it.
          <div
            id={headingId}
            className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1.5 border-b border-border bg-raised px-3.5 py-3 font-medium"
          >
            {heading}
          </div>
        )}
        {children}
        {foot ? (
          <div id={footId} className="mt-1 border-t border-border px-2 pt-1.5 pb-0.5 text-small text-muted-foreground">
            {foot}
          </div>
        ) : null}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

/**
 * 40 px rows. Hovered or reached by the keyboard, a row takes `bg-subtle` and a 4 px ink bar at its
 * start, both fading in (the Orynx look, 18 Oct 2026). The bar is the row's focus mark in place of the
 * ring: Radix focuses a row under the pointer, so the ring would also follow the mouse. The outline
 * stays transparent, so forced-colours mode still draws it. Icons take the words' colour, as Home's
 * repository menu draws them; pass a quieter icon (`text-muted-foreground`) where the design does, as
 * in the + menu. Only the chevron is quiet by default.
 */
export const menuItemClass = cn(
  'relative flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-sm px-3 py-1.5 text-start text-foreground no-underline outline-hidden select-none data-disabled:cursor-not-allowed data-disabled:opacity-45 data-highlighted:bg-subtle',
  'before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-primary before:opacity-0 data-highlighted:before:opacity-100 motion-safe:before:transition-opacity',
);

interface ItemContentProps {
  /** A lucide icon before the words. */
  icon?: ReactNode;
  /** One line under the item's name, cut off with an ellipsis. */
  description?: ReactNode;
  /** A folder path under the item's name, in mono, cut off with an ellipsis. */
  path?: ReactNode;
}

/** The icon, then the name with its description or path under it. `className` sizes the words' column. */
function ItemBody({
  icon,
  description,
  path,
  className,
  children,
}: ItemContentProps & { className?: string; children: ReactNode }) {
  return (
    <>
      {icon}
      <span className={cn('flex min-w-0 flex-1 flex-col', className)}>
        {children}
        {description ? <span className="truncate text-small text-muted-foreground">{description}</span> : null}
        {path ? <span className="truncate font-mono text-code text-muted-foreground">{path}</span> : null}
      </span>
    </>
  );
}

/** Typeahead matches the item's name, not its description or path. */
function nameOf(children: ReactNode, textValue: string | undefined): string | undefined {
  return textValue ?? (typeof children === 'string' ? children : undefined);
}

export type MenuItemProps = ComponentProps<typeof MenuPrimitive.Item> &
  ItemContentProps & {
    /** Shows a chevron: picking the item leads on to more choices. */
    leadsOn?: boolean;
  };

/**
 * One choice. Use `asChild` with a link when it goes somewhere ("Manage folders"); the icon and
 * chevron go inside the link.
 */
export function MenuItem({
  icon,
  description,
  path,
  leadsOn = false,
  asChild = false,
  textValue,
  className,
  children,
  ...props
}: MenuItemProps) {
  const chevron = leadsOn ? (
    <Icon icon={ArrowRight01Icon} aria-hidden className="ms-auto text-muted-foreground" />
  ) : null;
  const itemProps = {
    'data-slot': 'menu-item',
    textValue: nameOf(children, textValue),
    className: cn(menuItemClass, className),
    ...props,
  };

  if (asChild) {
    // Slot needs the link as its own child (not inside a fragment) to put the icon and chevron in it.
    return (
      <MenuPrimitive.Item asChild {...itemProps}>
        {icon}
        <Slot.Slottable>{children}</Slot.Slottable>
        {chevron}
      </MenuPrimitive.Item>
    );
  }
  return (
    <MenuPrimitive.Item {...itemProps}>
      <ItemBody icon={icon} description={description} path={path}>
        {children}
      </ItemBody>
      {chevron}
    </MenuPrimitive.Item>
  );
}

/** A set of choices where one is picked, such as the folder a session works in. */
export function MenuRadioGroup(props: ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />;
}

export type MenuRadioItemProps = ComponentProps<typeof MenuPrimitive.RadioItem> & ItemContentProps;

/** One choice in a MenuRadioGroup. The picked one is announced as checked and shows an ink check. */
export function MenuRadioItem({
  icon,
  description,
  path,
  textValue,
  className,
  children,
  ...props
}: MenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      textValue={nameOf(children, textValue)}
      className={cn(menuItemClass, className)}
      {...props}
    >
      <ItemBody icon={icon} description={description} path={path}>
        {children}
      </ItemBody>
      <MenuPrimitive.ItemIndicator className="ms-auto inline-flex">
        <Icon icon={Tick02Icon} aria-hidden className="text-info" />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export type MenuCheckboxItemProps = ComponentProps<typeof MenuPrimitive.CheckboxItem> & ItemContentProps;

/**
 * One option that is ticked or not, such as a filter's value (spec 007 Q10c, Q11c). Every option
 * leads with a 20 px box, so a menu of them reads as tick-several; a ticked one is announced as
 * checked and its box fills with ink around the tick. The rows are 32 px, a dense list, and a long
 * name wraps. Ticking keeps the menu open, so several can be ticked in a row; Esc, Tab or a click
 * outside closes it.
 */
export function MenuCheckboxItem({
  icon,
  description,
  path,
  textValue,
  className,
  onSelect,
  children,
  ...props
}: MenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      textValue={nameOf(children, textValue)}
      className={cn(menuItemClass, 'group min-h-8 py-1', className)}
      onSelect={(event) => {
        onSelect?.(event);
        event.preventDefault();
      }}
      {...props}
    >
      <span
        aria-hidden
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center self-start rounded-sm border border-control bg-raised group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary motion-safe:transition-colors"
      >
        <MenuPrimitive.ItemIndicator className="inline-flex motion-safe:animate-fade-in">
          <Icon icon={Tick02Icon} className="size-3.5 text-primary-foreground" />
        </MenuPrimitive.ItemIndicator>
      </span>
      <ItemBody icon={icon} description={description} path={path} className="max-w-80 wrap-anywhere">
        {children}
      </ItemBody>
    </MenuPrimitive.CheckboxItem>
  );
}

/** A section's name: 14 px in `text-secondary`. Arrow keys skip it. */
export function MenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      data-slot="menu-label"
      className={cn('px-2 pt-1.5 pb-1 text-small text-muted-foreground', className)}
      {...props}
    />
  );
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn('my-1.5 h-px shrink-0 bg-border', className)}
      {...props}
    />
  );
}
