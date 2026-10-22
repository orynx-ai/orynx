import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import {
  Delete02Icon,
  Link01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  StopIcon,
} from '@hugeicons/core-free-icons';
import type { SessionSummary } from '@devhub/contracts';
import { Icon, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { useChangeSession } from '../queries.ts';
import { DeleteSession } from './delete-session.tsx';
import { RenameSession } from './rename-session.tsx';

export type SessionMenuSession = Pick<SessionSummary, 'id' | 'title' | 'state' | 'pinnedAt'>;

/** What a session's menu opens once it has closed: a dialog. */
export type SessionMenuPick = 'rename' | 'delete';

/**
 * "Link copied" for screen readers for 2 s after Copy link. The menu has closed by then, so its menu's owner keeps
 * `note` beside the menu.
 */
export function useLinkCopied() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => {
      clearTimeout(reset);
    };
  }, [copied]);
  // Only while it has something to say: every sidebar row has a menu, and the list needs no empty live regions.
  const note = copied ? (
    <span role="status" className="sr-only">
      Link copied
    </span>
  ) : null;
  return {
    note,
    onCopied: () => {
      setCopied(true);
    },
  };
}

/**
 * Rename, Pin or Unpin, Copy link and Delete (spec 039, AC-25), for any menu that holds a session's actions: its row's
 * ⋯ and the Session screen's More actions. Pin and Copy link happen at once; the other two say which dialog to open
 * once the menu has closed and let go of focus. Delete is offered while Claude works, but disabled, with the reason
 * (AC-33).
 */
export function SessionMenuItems({
  session,
  onPick,
  onCopied,
}: {
  session: SessionMenuSession;
  onPick: (pick: SessionMenuPick) => void;
  onCopied: () => void;
}) {
  const router = useRouter();
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
      <MenuItem
        icon={<Icon icon={Link01Icon} />}
        onSelect={() => {
          // In the router's own form, so the desktop app's hash address works too (the user's call, 22 Oct 2026).
          const { href } = router.buildLocation({ to: '/sessions/$sessionId', params: { sessionId: session.id } });
          const link = new URL(router.history.createHref(href), window.location.href).href;
          void navigator.clipboard.writeText(link).then(onCopied, () => undefined);
        }}
      >
        Copy link
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
 * closes, or to `afterDelete`'s place once the session is gone. While Claude works it starts with Stop, as the Session
 * screen's Stop does (the user's call, 20 Oct 2026); `sessions.changed` then brings the stopped row.
 */
export function SessionMenu({ session, afterDelete }: { session: SessionMenuSession; afterDelete: () => void }) {
  const more = useRef<HTMLButtonElement>(null);
  const picked = useRef<SessionMenuPick | null>(null);
  const [dialog, setDialog] = useState<SessionMenuPick | null>(null);
  const close = () => {
    setDialog(null);
  };
  const api = useApi();
  const stop = useMutation({ mutationFn: () => api.stopSession(session.id) });
  const working = session.state === 'working' || session.state === 'needs_you';
  const linkCopied = useLinkCopied();

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
          {working ? (
            <>
              <MenuItem
                icon={<Icon icon={StopIcon} />}
                onSelect={() => {
                  stop.mutate();
                }}
              >
                Stop
              </MenuItem>
              <MenuSeparator />
            </>
          ) : null}
          <SessionMenuItems
            session={session}
            onPick={(pick) => {
              picked.current = pick;
            }}
            onCopied={linkCopied.onCopied}
          />
        </MenuContent>
      </Menu>
      {linkCopied.note}
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
