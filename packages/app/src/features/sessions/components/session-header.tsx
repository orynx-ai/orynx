import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowUpRight01Icon,
  ComputerTerminal01Icon,
  GitPullRequestIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  SourceCodeIcon,
  StopIcon,
  Upload01Icon,
  VisualStudioCodeIcon,
} from '@hugeicons/core-free-icons';
import type { Session, SessionState } from '@devhub/contracts';
import {
  Button,
  Icon,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Pill,
  Skeleton,
  sessionStateLabel,
  type PillTone,
} from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { usePlatform } from '../../../platform.tsx';
import { terminalShortcut } from '../../../shell/shortcuts.ts';
import { useWide } from '../../../shell/use-wide.ts';
import { needsApprovalLabel } from '../approval-words.ts';
import { editorLink, openInLabel } from '../change-words.ts';
import { openPullRequestLabel, pullRequestWords } from '../pull-request-words.ts';
import { useEditor, useHasChanges, useSessionPorts } from '../queries.ts';
import { CreatePullRequest } from './create-pull-request.tsx';
import { DeleteSession } from './delete-session.tsx';
import { RenameSession } from './rename-session.tsx';
import { SessionMenuItems, type SessionMenuPick } from './session-menu.tsx';
import { SessionTerminal } from './terminal/session-terminal.tsx';
import { terminalWords } from './terminal/terminal-words.ts';
import { PushChanges } from './push-changes.tsx';

/** The state pill's colour, as the sidebar colours each state (Q10b). */
const stateTones: Record<SessionState, PillTone> = {
  working: 'info',
  needs_you: 'warning',
  done: 'success',
  pr_open: 'neutral',
  stopped: 'neutral',
};

/**
 * Create pull request shows once Claude isn't working, while the worktree is there and no pull request is open
 * (spec 014, Q2): Done, or Stopped after Stop, an error or Orynx closing.
 */
function canCreatePullRequest(session: Session): boolean {
  const working = session.state === 'working' || session.state === 'needs_you';
  return !working && session.pullRequest === null && session.discardedAt === null && session.worktreePath !== null;
}

/**
 * Push changes shows once a pull request is open, whenever Claude isn't working and the worktree is there (Q7), until
 * origin's branch has everything, whoever pushed it.
 */
function canPush(session: Session): boolean {
  const working = session.state === 'working' || session.state === 'needs_you';
  return !working && session.discardedAt === null && session.worktreePath !== null && session.unpushed;
}

/** Before Claude's first edit, a Build session has no branch (spec 042, Q11). */
const noBranchYet = 'No branch yet';

/** The session's first web address while it listens (spec 042): the page bar is all you need to open the app. */
function SessionAddress({ session }: { session: Session }) {
  const platform = usePlatform();
  const url = useSessionPorts(session).data?.find((port) => port.url !== null)?.url ?? null;
  if (url === null) return null;
  return (
    <a
      href={url}
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-info underline"
      onClick={(event) => {
        event.preventDefault();
        platform.openExternal(url);
      }}
    >
      {new URL(url).host}
      <Icon icon={ArrowUpRight01Icon} aria-hidden className="size-4" />
    </a>
  );
}

/**
 * The Session screen's title row (`session.html`): the title, the state, the branch and where Claude works. Its
 * buttons are in the page bar, in {@link SessionActions} (the user's call, 19 Oct 2026).
 */
export function SessionHeader({ session, title }: { session: Session; title: RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h1 ref={title} tabIndex={-1} className="m-0 text-title-lg font-medium">
        {session.title}
      </h1>
      <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
        <Pill tone={stateTones[session.state]}>
          {/* The sidebar's "Needs you" is said in full here, where you answer (spec 012, Q8d). */}
          {session.state === 'needs_you' ? needsApprovalLabel : sessionStateLabel(session.state, session.ready)}
        </Pill>
        {session.branch !== null ? (
          <code className="rounded-sm bg-subtle px-2 font-mono text-code text-foreground">{session.branch}</code>
        ) : session.mode === 'build' && session.worktreePath !== null ? (
          // The branch comes at Claude's first edit (spec 042).
          <span className="rounded-sm bg-subtle px-2">{noBranchYet}</span>
        ) : null}
        <SessionAddress session={session} />
        {/* An Ask may have no folder at all (spec 031, Q8d). */}
        {session.folder === null ? (
          <span>Ask session · changes nothing</span>
        ) : session.mode === 'ask' ? (
          <span>Ask session · reads {session.folder.name} in place and changes nothing</span>
        ) : session.workOn === 'pull_request' && session.pullRequest !== null ? (
          <span>{`in ${session.folder.name} · on #${String(session.pullRequest.number)}'s branch, in a separate worktree`}</span>
        ) : (
          <span>in {session.folder.name} · separate worktree, your main checkout is untouched</span>
        )}
      </div>
    </div>
  );
}

/**
 * The session's buttons, small, in the page bar (the user's call, 19 Oct 2026): Stop while Claude works (AC-9);
 * once Claude is done, Create pull request when there's something to put in one; once the pull request is open,
 * Open PR and Push changes, with no primary button (spec 014, Q10e). Terminal and Open in the editor wait in More
 * actions (spec 038), then Rename, Pin and Delete (spec 039, where Delete took Discard changes' place, the user's call,
 * 20 Oct 2026). Under 768 px everything but Stop moves into More actions, so the bar keeps to one line.
 * Stop keeps focus while it runs; once the session has stopped, the title takes focus, because the button is gone.
 */
export function SessionActions({ session, title }: { session: Session; title: RefObject<HTMLHeadingElement | null> }) {
  const platform = usePlatform();
  const wide = useWide();
  const more = useRef<HTMLButtonElement>(null);
  const createDialog = useRef<{ open: () => void }>(null);
  const pushDialog = useRef<{ open: () => void }>(null);
  const terminalDialog = useRef<{ open: () => void }>(null);
  // The dialog an item opens, once the menu has closed and let go of focus.
  const picked = useRef<'create' | 'push' | 'terminal' | SessionMenuPick | null>(null);
  // Rename and Delete (spec 039), opened as the sidebar's ⋯ opens them.
  const [sessionDialog, setSessionDialog] = useState<SessionMenuPick | null>(null);
  // Once you've created the pull request, focus goes to Open PR, now or as soon as it shows (spec 014, AC-4);
  // under 768 px Open PR is in More actions, so to that.
  const justOpened = useRef(false);
  const openPullRequest = useRef<HTMLAnchorElement>(null);
  const { pullRequest } = session;
  useEffect(() => {
    if (pullRequest === null || !justOpened.current) return;
    justOpened.current = false;
    (openPullRequest.current ?? more.current)?.focus();
  }, [pullRequest]);
  const api = useApi();
  const stop = useMutation({ mutationFn: () => api.stopSession(session.id) });
  const working = session.state === 'working' || session.state === 'needs_you';
  const stopping = stop.isPending || (stop.isSuccess && working);
  const hasChanges = useHasChanges(session.id);
  // The editor Settings picks, VS Code until Settings answers otherwise (spec 013, Q9).
  const preferences = useEditor();
  const editor = preferences.data ?? (preferences.isError ? 'vscode' : null);

  useEffect(() => {
    if (stop.isSuccess && !working) title.current?.focus();
  }, [stop.isSuccess, working, title]);

  const offerCreate = canCreatePullRequest(session) && hasChanges;
  const offerPush = pullRequest !== null && canPush(session);
  // An Ask session has no worktree to open (spec 026); nor is there one once discarded or before it's made.
  const kept = session.mode !== 'ask' && session.discardedAt === null;
  const editorPath = kept && editor !== null ? session.worktreePath : null;
  const menu = wide ? undefined : more;
  // Rename, Pin and Delete are always there (spec 039, AC-34), so More actions is too.

  return (
    <>
      {session.terminal ? <SessionTerminal ref={terminalDialog} session={session} returnTo={more} /> : null}
      {working ? (
        <Button
          variant="secondary"
          size="sm"
          pending={stopping}
          onClick={() => {
            stop.mutate();
          }}
        >
          {/* Turning while Claude runs; the stop square while it waits for you (the user's call, 20 Oct 2026). */}
          {stopping ? null : session.state === 'working' ? (
            <Icon icon={Loading03Icon} aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Icon icon={StopIcon} aria-hidden />
          )}
          {stopping ? 'Stopping…' : 'Stop'}
        </Button>
      ) : null}
      <CreatePullRequest
        ref={createDialog}
        session={session}
        show={offerCreate}
        {...(menu === undefined ? {} : { menu })}
        onOpened={() => {
          if (pullRequest === null) justOpened.current = true;
          else (openPullRequest.current ?? more.current)?.focus();
        }}
      />
      {pullRequest === null || !wide ? null : (
        <Button asChild variant="secondary" size="sm">
          <a
            ref={openPullRequest}
            href={pullRequest.url}
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              platform.openExternal(pullRequest.url);
            }}
          >
            {openPullRequestLabel(pullRequest.number)}
            <Icon icon={ArrowUpRight01Icon} aria-hidden />
          </a>
        </Button>
      )}
      {pullRequest === null ? null : (
        <PushChanges
          ref={pushDialog}
          session={session}
          repository={pullRequest.repository}
          show={offerPush}
          onPushed={() => {
            (openPullRequest.current ?? more.current)?.focus();
          }}
          {...(menu === undefined ? {} : { menu })}
        />
      )}
      <RenameSession
        session={session}
        open={sessionDialog === 'rename'}
        onClose={() => {
          setSessionDialog(null);
        }}
        returnFocusTo={() => more.current}
      />
      <DeleteSession
        session={session}
        open={sessionDialog === 'delete'}
        onClose={() => {
          setSessionDialog(null);
        }}
        returnFocusTo={() => more.current}
        // It goes to the Sessions page itself, where the page takes focus.
        onDeleted={() => undefined}
      />
      <Menu>
        <MenuTrigger asChild>
          <IconButton ref={more} variant="ghost" size="sm" label="More actions">
            <Icon icon={MoreHorizontalIcon} aria-hidden />
          </IconButton>
        </MenuTrigger>
        <MenuContent
          size="sm"
          align="end"
          onCloseAutoFocus={(event) => {
            const dialog = picked.current;
            if (dialog === null) return;
            picked.current = null;
            event.preventDefault();
            if (dialog === 'rename' || dialog === 'delete') {
              setSessionDialog(dialog);
              return;
            }
            const dialogs = {
              create: createDialog,
              push: pushDialog,
              terminal: terminalDialog,
            };
            dialogs[dialog].current?.open();
          }}
        >
          {session.terminal ? (
            <MenuItem
              icon={<Icon icon={ComputerTerminal01Icon} />}
              aria-keyshortcuts={terminalShortcut(platform).ariaKeyShortcuts}
              onSelect={() => {
                picked.current = 'terminal';
              }}
            >
              {terminalWords.button}
            </MenuItem>
          ) : null}
          {!wide && offerCreate ? (
            <MenuItem
              icon={<Icon icon={GitPullRequestIcon} />}
              onSelect={() => {
                picked.current = 'create';
              }}
            >
              {pullRequestWords.create}
            </MenuItem>
          ) : null}
          {!wide && pullRequest !== null ? (
            // An item, not a link: a link's own click would have to stop the browser, and that stops the menu closing.
            <MenuItem
              icon={<Icon icon={ArrowUpRight01Icon} />}
              onSelect={() => {
                platform.openExternal(pullRequest.url);
              }}
            >
              {openPullRequestLabel(pullRequest.number)}
            </MenuItem>
          ) : null}
          {!wide && offerPush ? (
            <MenuItem
              icon={<Icon icon={Upload01Icon} />}
              onSelect={() => {
                picked.current = 'push';
              }}
            >
              {pullRequestWords.push}
            </MenuItem>
          ) : null}
          {editor === null || editorPath === null ? null : (
            <MenuItem asChild icon={<Icon icon={editor === 'vscode' ? VisualStudioCodeIcon : SourceCodeIcon} />}>
              <a href={editorLink(editor, editorPath)}>{openInLabel(editor)}</a>
            </MenuItem>
          )}
          <SessionMenuItems
            session={session}
            onPick={(pick) => {
              picked.current = pick;
            }}
          />
        </MenuContent>
      </Menu>
    </>
  );
}

/** The title row's loading form: the same two lines, so nothing moves when the session arrives (AC-16). */
export function SessionHeaderSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      <span className="flex h-7 items-center">
        <Skeleton className="h-5 w-2/3" />
      </span>
      <span className="flex h-6 items-center">
        <Skeleton className="h-4 w-1/2" />
      </span>
    </div>
  );
}
