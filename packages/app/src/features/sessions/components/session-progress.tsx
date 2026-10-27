import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown01Icon,
  BubbleChatIcon,
  Cancel01Icon,
  CheckListIcon,
  Delete02Icon,
  FileSearchIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  PencilEdit01Icon,
  PowerIcon,
  SentIcon,
  StopIcon,
  TerminalIcon,
  Tick02Icon,
  Ticket01Icon,
} from '@hugeicons/core-free-icons';
import { stepsOf, type Session, type SessionActivity, type SessionStep } from '@devhub/contracts';
import {
  ActivityGroup,
  ActivityList,
  ActivityStep,
  Button,
  Callout,
  CommandLine,
  Icon,
  IconButton,
  Markdown,
  Panel,
  Skeleton,
  Stepper,
  Tooltip,
  type ActivityStepState,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { durationText } from '../../../words/duration.ts';
import { useNow } from '../../../words/use-now.ts';
import { groupsOf, stepTimeText } from '../activity-groups.ts';
import { followWords, problemWords, stepWords, usageWords } from '../step-words.ts';
import { ApprovalCallout } from './approval-callout.tsx';
import { StepDetails, hasDetails } from './step-details.tsx';

/** Where the session is among its own steps (spec 042), with the steps it passed over (spec 031). */
export function SessionStepper({ session, className }: { session: Session; className?: string }) {
  const steps = stepsOf(session);
  const at = (kind: SessionStep) => steps.findIndex((step) => step.kind === kind);
  return (
    <Stepper
      className={className}
      aria-label="Session progress"
      steps={steps.map((step) => step.label)}
      current={at(session.step)}
      skipped={session.skipped.map(at)}
    />
  );
}

const kindIcons = {
  reading: CheckListIcon,
  steps_changed: CheckListIcon,
  branch_made: GitBranchIcon,
  server: TerminalIcon,
  worktree: GitBranchIcon,
  brief: SentIcon,
  explore: FileSearchIcon,
  plan: CheckListIcon,
  edit: PencilEdit01Icon,
  refused: Cancel01Icon,
  waiting: TerminalIcon,
  command: TerminalIcon,
  denied: Cancel01Icon,
  no_commands: TerminalIcon,
  finished: Tick02Icon,
  message: BubbleChatIcon,
  pull_request: GitPullRequestIcon,
  pushed: GitPullRequestIcon,
  ticket: Ticket01Icon,
  jira: Ticket01Icon,
  stopped: StopIcon,
  interrupted: PowerIcon,
  discarded: Delete02Icon,
} as const;

/** Steps that ended the work, were refused, or are your own message aren't something done, so they keep the plain dot. */
const plainKinds = new Set<SessionActivity['kind']>([
  'message',
  'refused',
  'denied',
  'no_commands',
  'stopped',
  'interrupted',
  'discarded',
]);

function look(activity: SessionActivity): { state: ActivityStepState | undefined; icon: ReactNode } {
  if (activity.state === 'done' && !plainKinds.has(activity.kind)) {
    return { state: 'done', icon: <Icon icon={Tick02Icon} /> };
  }
  // A call waiting for you is amber, with the kind of work it waits to do (spec 012, as session.html draws it).
  if (activity.kind === 'waiting') {
    const waitsFor =
      activity.about === 'edit' ? PencilEdit01Icon : activity.about === 'jira' ? Ticket01Icon : TerminalIcon;
    return { state: 'waiting', icon: <Icon icon={waitsFor} /> };
  }
  return { state: undefined, icon: <Icon icon={kindIcons[activity.kind]} /> };
}

/** A pull request's step, with its number as a link to it on GitHub, opened outside Orynx (spec 014, Q10f). */
function PullRequestTitle({ title, number, url }: { title: string; number: number; url: string }) {
  const platform = usePlatform();
  const mark = `#${String(number)}`;
  const at = title.indexOf(mark);
  return (
    <>
      {title.slice(0, at)}
      <a
        href={url}
        rel="noreferrer"
        className="text-info underline"
        onClick={(event) => {
          event.preventDefault();
          platform.openExternal(url);
        }}
      >
        {mark}
      </a>
      {title.slice(at + mark.length)}
    </>
  );
}

function titleOf(activity: SessionActivity, title: string): ReactNode {
  if (activity.kind !== 'pull_request' && activity.kind !== 'pushed') return title;
  return <PullRequestTitle title={title} number={activity.number} url={activity.url} />;
}

/** A command, drawn as code wherever a step says one (the user's call, 19 Oct 2026). */
function Command({ children }: { children: string }) {
  return <code className="font-mono text-code wrap-anywhere text-foreground">{children}</code>;
}

/** Commands as the other steps list files, each as code: "a, b and c", then "a, b, c and 2 more". */
function commandsDetail(commands: readonly string[]): ReactNode {
  const shown = commands.slice(0, 3);
  const more = commands.length - shown.length;
  return (
    <>
      {shown.map((command, index) => (
        // The same command can run twice; their order is fixed.
        <Fragment key={index}>
          {index === 0 ? null : index === shown.length - 1 && more === 0 ? ' and ' : ', '}
          <Command>{command}</Command>
        </Fragment>
      ))}
      {more > 0 ? ` and ${String(more)} more` : null}
    </>
  );
}

/** Commands inside a step's group (spec 048): each on one line, in full on a press, then "and 2 more". */
function CommandLines({ commands }: { commands: readonly string[] }) {
  const shown = commands.slice(0, 3);
  const more = commands.length - shown.length;
  return (
    <div className="mt-1 flex flex-col gap-1">
      {shown.map((command, index) => (
        // The same command can run twice; their order is fixed.
        <CommandLine key={index} command={command} />
      ))}
      {more > 0 ? <span>{`and ${String(more)} more`}</span> : null}
    </div>
  );
}

/** Claude's summary laid out as the Markdown it writes, not its raw marks. */
function Summary({ text }: { text: string }) {
  const platform = usePlatform();
  return (
    <Markdown
      text={text}
      onOpenLink={(url) => {
        platform.openExternal(url);
      }}
    />
  );
}

/** A step's line under its title: commands as code, the brief's files by name with their paths on hover. */
function detailOf(activity: SessionActivity, detail: string | null, grouped: boolean): ReactNode {
  if (activity.kind === 'command') {
    return grouped ? <CommandLines commands={activity.commands} /> : commandsDetail(activity.commands);
  }
  if (activity.kind === 'finished' && detail !== null) return <Summary text={activity.summary} />;
  if (activity.kind === 'denied' && activity.about === 'command') return <Command>{activity.text}</Command>;
  if (activity.kind === 'refused' && activity.access === 'run') return <Command>{activity.path}</Command>;
  // The brief's files show by name; their full paths are the tooltip (spec 022, AC-17).
  if (activity.kind === 'brief' && activity.files.length > 0) {
    return <span title={activity.files.join('\n')}>{detail}</span>;
  }
  return detail;
}

/**
 * Follows Claude's progress to its end as steps come, while its end is in view; once you scroll up it stops, and
 * Jump to latest takes you back and follows again (the user's call, 19 Oct 2026). `end` marks the pane's end.
 */
function useFollow(changed: string) {
  const end = useRef<HTMLDivElement>(null);
  const seen = useRef(changed);
  const [atEnd, setAtEnd] = useState(true);
  const following = useRef(true);
  useEffect(() => {
    const marker = end.current;
    if (marker === null) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined) return;
      following.current = entry.isIntersecting;
      setAtEnd(entry.isIntersecting);
    });
    observer.observe(marker);
    return () => {
      observer.disconnect();
    };
  }, []);
  // A new or longer step moves the end on; while following, the page goes with it before it's painted. Opening
  // the session doesn't move it.
  useLayoutEffect(() => {
    if (changed === seen.current) return;
    seen.current = changed;
    if (following.current) end.current?.scrollIntoView({ block: 'end' });
  }, [changed]);
  const reduced =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    end,
    atEnd,
    jump: () => {
      following.current = true;
      end.current?.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
    },
  };
}

/** A line that holds a command in backticks, with the command shown as code. */
function withCode(line: string): ReactNode[] {
  return line.split('`').map((part, index) => (index % 2 === 1 ? <code key={part}>{part}</code> : part));
}

/**
 * How long Claude has worked, over its first run and every follow-up (spec 013, Q3): moving each second while
 * a run goes on, and still while Claude waits for you to follow up. Once a turn has ended, its turns and their cost
 * follow (spec 047), with a tooltip that says what the cost is; before that, or for an older session, the time alone.
 */
function WorkedFor({ session }: { session: Session }) {
  const { runStartedAt, turns, costUsd } = session;
  const now = useNow(runStartedAt === null ? 60_000 : 1_000);
  const running = runStartedAt === null ? 0 : Math.max(0, now.getTime() - Date.parse(runStartedAt));
  const parts = [
    durationText(session.workedMs + running),
    ...(turns > 0 ? [usageWords.turns(turns)] : []),
    ...(costUsd === null ? [] : [usageWords.cost(costUsd)]),
  ];
  const look = 'text-small text-muted-foreground';
  if (parts.length === 1) return <span className={look}>{parts[0]}</span>;
  return (
    <Tooltip label={usageWords.about}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the tooltip says what the cost is, so a keyboard must reach it (WCAG 1.4.13) */}
      <span tabIndex={0} className={look}>
        {parts.join(' · ')}
      </span>
    </Tooltip>
  );
}

/**
 * "What Claude did" (`session-review.html`, spec 048; "Claude's progress" in `session.html`): why the session couldn't
 * start when it couldn't, then each step in its words, the latest one still running (AC-4, AC-13), then the follow-up
 * box (spec 013). A session from spec 048 on groups the steps under its own (`groupsOf`): the one Claude is on starts
 * open, a step you open stays open, and Claude's last summary shows after them. The approval stays under the last
 * step, outside the groups, so closing one never hides it. The box sticks to the window's bottom while the pane is
 * taller than the window (spec 013, Q6b).
 */
export function SessionProgress({ session, footer }: { session: Session; footer?: ReactNode }) {
  const problem = session.problem === null ? null : problemWords(session.problem, session);
  // Focus comes here once you've answered the last call waiting for you (spec 012, AC-18).
  const pane = useRef<HTMLElement>(null);
  // The step shown in full, by its id, so it follows the session as it changes.
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = session.activities.find((activity) => activity.id === shownId) ?? null;
  const { end, atEnd, jump } = useFollow(session.updatedAt);
  const groups = groupsOf(session);
  // Which steps you opened or closed, by kind; the rest follow where Claude is: the step of its latest activity, which
  // after a follow-up may come before a later one (AC-10).
  const [opened, setOpened] = useState<Partial<Record<SessionStep, boolean>>>({});
  const newest = session.activities.findLast((activity) =>
    groups?.some((group) => group.activities.includes(activity)),
  );
  const currentKind = groups?.find((group) => newest !== undefined && group.activities.includes(newest))?.step.kind;
  const isOpen = (kind: SessionStep) => opened[kind] ?? kind === currentKind;
  const anyClosed = groups?.some((group) => !isOpen(group.step.kind)) ?? false;
  const working = session.state === 'working' || session.state === 'needs_you';
  const last = session.activities.at(-1);
  const row = (activity: SessionActivity, grouped: boolean, className?: string) => {
    const words = stepWords(activity);
    const { state, icon } = look(activity);
    return (
      <ActivityStep
        key={activity.id}
        state={state}
        icon={icon}
        title={titleOf(activity, words.title)}
        detail={detailOf(activity, words.detail, grouped)}
        className={className}
        onOpen={
          hasDetails(activity)
            ? () => {
                setShownId(activity.id);
              }
            : undefined
        }
      />
    );
  };
  return (
    <>
      <Panel
        ref={pane}
        tabIndex={-1}
        title="What Claude did"
        actions={
          <>
            <WorkedFor session={session} />
            {groups === null ? null : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpened(Object.fromEntries(groups.map((group) => [group.step.kind, anyClosed])));
                }}
              >
                {anyClosed ? 'Expand all' : 'Collapse all'}
              </Button>
            )}
          </>
        }
        // Stacked, it's clipped without being a scroll box, so the box at its end can stick to the window. Side by side
        // (spec 048, Q4), it's held in view under the page bar, as tall as the window less the bar and its gaps, and
        // its steps scroll on their own above the box.
        // style-policy-ignore-next-line: the window's height less the page bar and its gaps has no scale step
        className="overflow-clip @3xl:sticky @3xl:top-20 @3xl:flex @3xl:max-h-[calc(100svh-7rem)] @3xl:flex-col"
      >
        <div className="flex flex-col gap-4 p-4 @3xl:min-h-0 @3xl:flex-1 @3xl:overflow-y-auto">
          {problem === null ? null : (
            <Callout tone="danger" role="alert" title={problem.title}>
              <span>{withCode(problem.line)}</span>
            </Callout>
          )}
          {groups === null ? (
            <ActivityList>{session.activities.map((activity) => row(activity, false))}</ActivityList>
          ) : (
            <ActivityList className="gap-0">
              {groups.map((group) => {
                const latest = group.activities.at(-1);
                const current = working && group.step.kind === currentKind;
                const state = current ? (session.state === 'needs_you' ? 'waiting' : undefined) : 'done';
                const { kind, label } = group.step;
                return (
                  <ActivityGroup
                    key={kind}
                    state={state}
                    icon={state === 'done' || latest === undefined ? <Icon icon={Tick02Icon} /> : look(latest).icon}
                    title={label}
                    // Only while it's closed: open, its latest row is right under it.
                    summary={isOpen(kind) || latest === undefined ? undefined : stepWords(latest).title}
                    time={group.ms === null ? undefined : stepTimeText(group.ms)}
                    open={isOpen(kind)}
                    onOpenChange={(open) => {
                      setOpened((was) => ({ ...was, [kind]: open }));
                    }}
                  >
                    <ActivityList aria-label={label}>
                      {group.activities.map((activity) => row(activity, true))}
                    </ActivityList>
                  </ActivityGroup>
                );
              })}
              {/* Claude's last summary, after the steps and always shown (AC-16). */}
              {last?.kind === 'finished' ? row(last, true, 'pt-3.5') : null}
            </ActivityList>
          )}
          {/* Under the last step, as a chat asks, not at the top (the user's call, 20 Oct 2026). */}
          <ApprovalCallout session={session} afterAll={pane} />
          {/* The steps' end: in view only once you've scrolled to the end of What Claude did. */}
          <div ref={end} aria-hidden />
        </div>
        {/* The steps pass under the follow-up box, on the pane's own colour; Jump to latest sits over it. */}
        <div className={footer === undefined ? 'sticky bottom-4 h-0' : 'sticky bottom-0 bg-raised px-4 pt-2 pb-4'}>
          {atEnd ? null : (
            <IconButton
              variant="secondary"
              label={followWords.jump}
              onClick={jump}
              className="absolute end-4 bottom-full mb-2 rounded-full shadow-overlay"
            >
              <Icon icon={ArrowDown01Icon} aria-hidden />
            </IconButton>
          )}
          {footer}
        </div>
      </Panel>
      <StepDetails
        session={session}
        activity={shown}
        onClose={() => {
          setShownId(null);
        }}
      />
    </>
  );
}

/** The stepper while the session loads: its shape, so nothing moves when it arrives (AC-16). */
export function SessionStepperSkeleton() {
  return (
    // Hidden from screen readers, as every skeleton is; the page says it's busy.
    <span aria-hidden className="flex h-6 items-center">
      <Skeleton className="h-4 w-80 max-w-full" />
    </span>
  );
}

/** The pane while the session loads: its shape, so nothing moves when it arrives (AC-16). */
export function SessionProgressSkeleton() {
  return (
    <div aria-hidden>
      <Panel title="What Claude did">
        <div className="flex flex-col gap-3.5 p-4">
          {[0, 1, 2].map((row) => (
            <span key={row} className="flex gap-3">
              <Skeleton shape="circle" className="size-6" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3.5 w-1/2" />
              </span>
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
