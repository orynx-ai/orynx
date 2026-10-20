import { useRef, useState, type ReactElement } from 'react';
import { Link } from '@tanstack/react-router';
import { ComputerIcon, Moon02Icon, Settings02Icon, Sun03Icon, UserIcon } from '@hugeicons/core-free-icons';
import {
  Avatar,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  Tooltip,
  type AvatarProps,
  type MenuContentProps,
  type TooltipProps,
} from '@devhub/ui';
import { defaultProfile } from '@devhub/contracts';
import { useStatus } from '../features/settings/queries.ts';
import { ThemeSchema, useThemeStore } from '../stores/theme-store.ts';
import { personName } from './person-name.ts';
import { ProfileDialog } from './profile-dialog.tsx';
import { useProfile } from './profile-queries.ts';
import { useWide } from './use-wide.ts';

/**
 * Who is using Orynx: the name from Edit profile, else the one the server knows. `pending` while neither is known
 * yet, so nothing says "You" before the profile and the status arrive.
 */
export function usePerson() {
  const status = useStatus();
  const saved = useProfile();
  const profile = saved.data ?? defaultProfile;
  const serverName = status.data?.user.name ?? null;
  const name = profile.name === '' ? serverName : profile.name;
  const person = name === null ? null : personName(name);
  return {
    serverName,
    name,
    short: person?.short ?? 'You',
    initials: person?.initials ?? '',
    bio: profile.bio,
    picture: profile.picture,
    pending: saved.isPending || (profile.name === '' && status.isPending),
  };
}

/** The person's picture or initials; a plain person icon while Orynx knows neither. */
export function PersonAvatar({ size }: { size?: AvatarProps['size'] }) {
  const person = usePerson();
  return person.name === null && person.picture === null ? (
    <Icon icon={UserIcon} aria-hidden />
  ) : (
    <Avatar initials={person.initials} src={person.picture} size={size} />
  );
}

const themes = [
  { value: 'light', label: 'Light', icon: Sun03Icon },
  { value: 'dark', label: 'Dark', icon: Moon02Icon },
  { value: 'system', label: 'System', icon: ComputerIcon },
] as const;

/**
 * The profile menu, opened from `children` (the sidebar footer, or the narrow bar's avatar): the person, who opens
 * Edit profile, then Appearance and Settings. `tooltip` names a trigger that shows no words.
 */
export function ProfileMenu({
  side,
  align,
  tooltip = null,
  tooltipSide,
  children,
}: Pick<MenuContentProps, 'side' | 'align'> & {
  tooltip?: TooltipProps['label'];
  tooltipSide?: TooltipProps['side'];
  children: ReactElement;
}) {
  const person = usePerson();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wide = useWide();
  const themeChoices = (
    <MenuRadioGroup
      value={theme}
      onValueChange={(value) => {
        setTheme(ThemeSchema.parse(value));
      }}
    >
      {themes.map(({ value, label, icon }) => (
        <MenuRadioItem key={value} value={value} icon={<Icon icon={icon} aria-hidden />}>
          {label}
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  );

  return (
    <>
      <Menu>
        <Tooltip label={tooltip} side={tooltipSide}>
          <MenuTrigger asChild ref={trigger}>
            {children}
          </MenuTrigger>
        </Tooltip>
        <MenuContent
          aria-label="Profile"
          side={side}
          align={align}
          // Edit profile's dialog takes focus; the menu must not pull it back to its trigger as it closes.
          onCloseAutoFocus={(event) => {
            if (editing) event.preventDefault();
          }}
        >
          <MenuItem
            icon={
              <span className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
                <PersonAvatar size="lg" />
              </span>
            }
            description={person.bio === '' ? 'Edit profile' : person.bio}
            textValue={person.short}
            onSelect={() => {
              setEditing(true);
            }}
          >
            <span className="truncate font-medium">{person.name ?? 'You'}</span>{' '}
          </MenuItem>
          <MenuSeparator />
          {wide ? (
            <MenuSub>
              <MenuSubTrigger icon={<Icon icon={Sun03Icon} aria-hidden />}>Appearance</MenuSubTrigger>
              <MenuSubContent aria-label="Appearance">{themeChoices}</MenuSubContent>
            </MenuSub>
          ) : (
            // A sub menu has no room beside the menu in a narrow window, so the choices sit in it.
            <>
              <MenuLabel>Appearance</MenuLabel>
              {themeChoices}
              <MenuSeparator />
            </>
          )}
          <MenuItem asChild icon={<Icon icon={Settings02Icon} aria-hidden />}>
            <Link to="/settings">Settings</Link>
          </MenuItem>
        </MenuContent>
      </Menu>
      <ProfileDialog
        open={editing}
        onOpenChange={setEditing}
        serverName={person.serverName}
        returnFocusTo={() => trigger.current}
      />
    </>
  );
}
