import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { DropdownMenu as MenuPrimitive, Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';

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
  /** One quiet line under the items ("Tip: …"). It also describes the menu, so screen readers hear it. */
  foot?: ReactNode;
};

/**
 * The menu itself, in a portal: `bg-raised`, a hairline, `radius-md` and the one shadow. It opens
 * under its trigger, flips above when there's no room below, keeps 16 px from the window's edges,
 * and scrolls inside itself when it's taller than the window (spec 006 Q4e). No animation.
 * Give it an `aria-label` when the trigger's words don't name it ("Repository" for a picker).
 */
export function MenuContent({
  className,
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
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="menu"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        // Named by its own label when it has one, rather than by the trigger's words.
        {...(props['aria-label'] === undefined ? {} : { 'aria-labelledby': undefined })}
        aria-describedby={foot ? footId : undefined}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key !== 'Tab' || event.defaultPrevented) return;
          event.preventDefault();
          setOpen(false);
        }}
        className={cn(
          'z-50 flex max-h-(--radix-dropdown-menu-content-available-height) max-w-(--radix-dropdown-menu-content-available-width) min-w-65 flex-col overflow-y-auto rounded-md border border-border bg-raised p-1.5 text-body text-foreground shadow-overlay',
          className,
        )}
        {...props}
      >
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

/** 40 px rows, `bg-subtle` when hovered or reached by the keyboard; icons are quieter than words. */
export const menuItemClass =
  'relative flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-start text-foreground no-underline select-none data-disabled:cursor-not-allowed data-disabled:opacity-45 data-highlighted:bg-subtle [&_svg:not([class*=text-])]:text-muted-foreground';

export type MenuItemProps = ComponentProps<typeof MenuPrimitive.Item> & {
  /** A lucide icon before the words. */
  icon?: ReactNode;
  /** One line under the item's name, cut off with an ellipsis. */
  description?: ReactNode;
  /** A folder path under the item's name, in mono, cut off with an ellipsis. */
  path?: ReactNode;
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
  const chevron = leadsOn ? <ChevronRight aria-hidden className="ms-auto" /> : null;
  const itemProps = {
    'data-slot': 'menu-item',
    // Typeahead matches the item's name, not its description or path.
    textValue: textValue ?? (typeof children === 'string' ? children : undefined),
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
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        {children}
        {description ? <span className="truncate text-small text-muted-foreground">{description}</span> : null}
        {path ? <span className="truncate font-mono text-code text-muted-foreground">{path}</span> : null}
      </span>
      {chevron}
    </MenuPrimitive.Item>
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
