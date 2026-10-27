import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowUpRight01Icon,
  ComputerTerminal01Icon,
  GitBranchIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  SourceCodeIcon,
  StopIcon,
  VisualStudioCodeIcon,
} from '@hugeicons/core-free-icons';
import type { Session, SessionState } from '@devhub/contracts';
import {
  Button,
  CopyButton,
  Icon,
  IconButton,
  Kbd,
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
import { agoText } from '../../../words/ago.ts';
import { useNow } from '../../../words/use-now.ts';
import { needsApprovalLabel } from '../approval-words.ts';
import { editorLink, openInLabel } from '../change-words.ts';
import { openPullRequestLabel } from '../pull-request-words.ts';
import { useEditor, useSessionPorts } from '../queries.ts';
import { DeleteSession } from './delete-session.tsx';
import { RenameSession } from './rename-session.tsx';
import { SessionMenuItems, useLinkCopied, type SessionMenuPick } from './session-menu.tsx';
import { SessionTerminal } from './terminal/session-terminal.tsx';
import { terminalWords } from './terminal/terminal-words.ts';

/** The state pill's colour, as the sidebar colours each state (Q10b). */
const stateTones: Record<SessionState, PillTone> = {
  working: 'info',
  needs_you: 'warning',
  done: 'success',
  pr_open: 'neutral',
  pr_merged: 'success',
  pr_closed: 'neutral',
  stopped: 'neutral',
};

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

/** The dot between the title row's parts, for the eye only. */
function Dot() {
  return <span aria-hidden>·</span>;
}

/**
 * The Session screen's title row (`session-review.html`, spec 048): the title, then one line with the state, the
 * skills your message named, the folder, the branch with Copy branch name, the worktree and when it started. Its
 * buttons are in the page bar, in {@link SessionActions} (the user's call, 19 Oct 2026).
 */
export function SessionHeader({ session, title }: { session: Session; title: RefObject<HTMLHeadingElement | null> }) {
  const now = useNow();
  const skills = session.activities.flatMap((activity) => (activity.kind === 'brief' ? activity.skills : []));
  const { branch, folder } = session;
  const ask = session.mode === 'ask';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h1 ref={title} tabIndex={-1} className="m-0 text-title-lg font-medium">
        {session.title}
      </h1>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-small text-muted-foreground">
        <Pill tone={stateTones[session.state]}>
          {/* The sidebar's "Needs you" is said in full here, where you answer (spec 012, Q8d). */}
          {session.state === 'needs_you' ? needsApprovalLabel : sessionStateLabel(session.state, session.ready)}
        </Pill>
        {skills.map((skill) => (
          <code key={skill} className="rounded-sm bg-subtle px-2 font-mono text-code text-foreground">
            {skill}
          </code>
        ))}
        {/* An Ask may have no folder at all (spec 031, Q8d). */}
        {folder === null ? (
          <span>Ask session · changes nothing</span>
        ) : ask ? (
          <span>Ask session · reads {folder.name} in place and changes nothing</span>
        ) : (
          <span>{folder.name}</span>
        )}
        {branch !== null ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Dot />
            <Icon icon={GitBranchIcon} aria-hidden className="size-4 shrink-0" />
            <code title={branch} className="min-w-0 truncate font-mono text-code text-foreground">
              {branch}
            </code>
            <CopyButton text={branch} label="Copy branch name" what={`branch name ${branch}`} />
          </span>
        ) : session.mode === 'build' && session.worktreePath !== null ? (
          // The branch comes at Claude's first edit (spec 042).
          <span className="rounded-sm bg-subtle px-2">{noBranchYet}</span>
        ) : null}
        <SessionAddress session={session} />
        {/* Each dot goes with what follows it, so a wrapped line never ends on one. */}
        {ask ? null : (
          <span className="inline-flex gap-2">
            <Dot />
            own worktree
          </span>
        )}
        <span className="inline-flex gap-2">
          <Dot />
          started {agoText(now.getTime() - Date.parse(session.startedAt))}
        </span>
      </div>
    </div>
  );
}

/**
 * The session's buttons, small, in the page bar (the user's call, 19 Oct 2026): Stop while Claude works (AC-9),
 * Terminal with its shortcut (spec 048), and Open PR once the pull request is open; Create pull request and Push are
 * the next-move bar's (spec 048). Open in the editor waits in More actions, then Rename, Pin and Delete (spec 039,
 * where Delete took Discard changes' place, the user's call, 20 Oct 2026). Under 768 px everything but Stop moves into
 * More actions, so the bar keeps to one line. Stop keeps focus while it runs; once the session has stopped, the title
 * takes focus, because the button is gone. `openPullRequest` and `more` are the screen's, for the bar's focus.
 */
export function SessionActions({
  session,
  title,
  openPullRequest,
  more,
}: {
  session: Session;
  title: RefObject<HTMLHeadingElement | null>;
  openPullRequest: RefObject<HTMLAnchorElement | null>;
  more: RefObject<HTMLButtonElement | null>;
}) {
  const platform = usePlatform();
  const wide = useWide();
  const terminalButton = useRef<HTMLButtonElement>(null);
  const terminalDialog = useRef<{ open: () => void }>(null);
  // The dialog an item opens, once the menu has closed and let go of focus.
  const picked = useRef<'terminal' | SessionMenuPick | null>(null);
  // Rename and Delete (spec 039), opened as the sidebar's ⋯ opens them.
  const [sessionDialog, setSessionDialog] = useState<SessionMenuPick | null>(null);
  const { pullRequest } = session;
  const shortcut = terminalShortcut(platform);
  const api = useApi();
  const stop = useMutation({ mutationFn: () => api.stopSession(session.id) });
  const working = session.state === 'working' || session.state === 'needs_you';
  const stopping = stop.isPending || (stop.isSuccess && working);
  // The editor Settings picks, VS Code until Settings answers otherwise (spec 013, Q9).
  const preferences = useEditor();
  const editor = preferences.data ?? (preferences.isError ? 'vscode' : null);
  const linkCopied = useLinkCopied();

  useEffect(() => {
    if (stop.isSuccess && !working) title.current?.focus();
  }, [stop.isSuccess, working, title]);

  // An Ask session has no worktree to open (spec 026); nor is there one once discarded or before it's made.
  const kept = session.mode !== 'ask' && session.discardedAt === null;
  const editorPath = kept && editor !== null ? session.worktreePath : null;
  // Rename, Pin and Delete are always there (spec 039, AC-34), so More actions is too.

  return (
    <>
      {session.terminal ? (
        <SessionTerminal ref={terminalDialog} session={session} returnTo={wide ? terminalButton : more} />
      ) : null}
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
      {session.terminal && wide ? (
        <Button
          ref={terminalButton}
          variant="ghost"
          size="sm"
          aria-keyshortcuts={shortcut.ariaKeyShortcuts}
          onClick={() => {
            terminalDialog.current?.open();
          }}
        >
          <Icon icon={ComputerTerminal01Icon} aria-hidden />
          {terminalWords.button}
          {/* From 1280 px: narrower, the bar keeps the room for the breadcrumb. */}
          <Kbd aria-hidden className="hidden xl:inline-flex">
            {shortcut.label}
          </Kbd>
        </Button>
      ) : null}
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
            terminalDialog.current?.open();
          }}
        >
          {session.terminal && !wide ? (
            <MenuItem
              icon={<Icon icon={ComputerTerminal01Icon} />}
              aria-keyshortcuts={shortcut.ariaKeyShortcuts}
              onSelect={() => {
                picked.current = 'terminal';
              }}
            >
              {terminalWords.button}
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
            onCopied={linkCopied.onCopied}
          />
        </MenuContent>
      </Menu>
      {linkCopied.note}
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
