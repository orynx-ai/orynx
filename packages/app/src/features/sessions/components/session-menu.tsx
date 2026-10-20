import { useRef, useState } from 'react';
import { Delete02Icon, MoreHorizontalIcon, PencilEdit02Icon, PinIcon, PinOffIcon } from '@hugeicons/core-free-icons';
import type { SessionSummary } from '@devhub/contracts';
import { Icon, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@devhub/ui';
import { useChangeSession } from '../queries.ts';
import { DeleteSession } from './delete-session.tsx';
import { RenameSession } from './rename-session.tsx';

export type SessionMenuSession = Pick<SessionSummary, 'id' | 'title' | 'state' | 'pinnedAt'>;

/** What a session's menu opens once it has closed: a dialog. */
export type SessionMenuPick = 'rename' | 'delete';

/**
 * Rename, Pin or Unpin, and Delete (spec 039, AC-25), for any menu that holds a session's actions: its row's ⋯ and the
 * Session screen's More actions. Pin happens at once; the other two say which dialog to open once the menu has closed
 * and let go of focus. Delete is offered while Claude works, but disabled, with the reason (AC-33).
 */
export function SessionMenuItems({
  session,
  onPick,
}: {
  session: SessionMenuSession;
  onPick: (pick: SessionMenuPick) => void;
}) {
  const change = useChangeSession();
  const pinned = session.pinnedAt !== null;
  const working = session.state === 'working' || session.state === 'needs_you';
  return (
    <>
      <MenuItem
        icon={<Icon icon={PencilEdit02Icon} />}
        onSelect={() => {
          onPick('rename');
        }}
      >
        Rename
      </MenuItem>
      <MenuItem
        icon={<Icon icon={pinned ? PinOffIcon : PinIcon} />}
        onSelect={() => {
          change.mutate({ id: session.id, change: { pinned: !pinned } });
        }}
      >
        {pinned ? 'Unpin' : 'Pin'}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<Icon icon={Delete02Icon} />}
        className="text-danger"
        disabled={working}
        {...(working ? { description: 'Stop the session first' } : {})}
        onSelect={() => {
          onPick('delete');
        }}
      >
        Delete
      </MenuItem>
    </>
  );
}

/**
 * A session row's ⋯ (spec 039, AC-24): the session's menu and the dialogs it opens. Focus goes back to ⋯ when a dialog
 * closes, or to `afterDelete`'s place once the session is gone.
 */
export function SessionMenu({ session, afterDelete }: { session: SessionMenuSession; afterDelete: () => void }) {
  const more = useRef<HTMLButtonElement>(null);
  const picked = useRef<SessionMenuPick | null>(null);
  const [dialog, setDialog] = useState<SessionMenuPick | null>(null);
  const close = () => {
    setDialog(null);
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            ref={more}
            variant="ghost"
            size="sm"
            label="More actions"
            aria-label={`More actions for ${session.title}`}
          >
            <Icon icon={MoreHorizontalIcon} aria-hidden />
          </IconButton>
        </MenuTrigger>
        <MenuContent
          size="sm"
          align="end"
          aria-label={`Actions for ${session.title}`}
          onCloseAutoFocus={(event) => {
            const pick = picked.current;
            if (pick === null) return;
            picked.current = null;
            event.preventDefault();
            setDialog(pick);
          }}
        >
          <SessionMenuItems
            session={session}
            onPick={(pick) => {
              picked.current = pick;
            }}
          />
        </MenuContent>
      </Menu>
      <RenameSession session={session} open={dialog === 'rename'} onClose={close} returnFocusTo={() => more.current} />
      <DeleteSession
        session={session}
        open={dialog === 'delete'}
        onClose={close}
        returnFocusTo={() => more.current}
        onDeleted={afterDelete}
      />
    </>
  );
}
