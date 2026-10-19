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
} from '@hugeicons/core-free-icons';
import type { Session, SessionActivity, SessionStep } from '@devhub/contracts';
import {
  ActivityList,
  ActivityStep,
  Callout,
  Icon,
  IconButton,
  Panel,
  Skeleton,
  Stepper,
  type ActivityStepState,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { durationText } from '../../../words/duration.ts';
import { useNow } from '../../../words/use-now.ts';
import { followWords, problemWords, stepWords } from '../step-words.ts';
import { ApprovalCallout } from './approval-callout.tsx';
import { StepDetails, hasDetails } from './step-details.tsx';

const steps = ['Plan', 'Build', 'Test', 'Review', 'Pull request'] as const;
const stepIndex: Record<SessionStep, number> = { plan: 0, build: 1, test: 2, review: 3, pull_request: 4 };

/** Where the session is: Plan, Build, Test, Review, Pull request (AC-7). */
export function SessionStepper({ session }: { session: Session }) {
  return <Stepper aria-label="Session progress" steps={steps} current={stepIndex[session.step]} />;
}

const kindIcons = {
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
    return { state: 'waiting', icon: <Icon icon={activity.about === 'edit' ? PencilEdit01Icon : TerminalIcon} /> };
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

/** A step's line under its title: commands as code, the brief's files by name with their paths on hover. */
function detailOf(activity: SessionActivity, detail: string | null): ReactNode {
  if (activity.kind === 'command') return commandsDetail(activity.commands);
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
 * a run goes on, and still while Claude waits for you to follow up.
 */
function WorkedFor({ session }: { session: Session }) {
  const { runStartedAt } = session;
  const now = useNow(runStartedAt === null ? 60_000 : 1_000);
  const running = runStartedAt === null ? 0 : Math.max(0, now.getTime() - Date.parse(runStartedAt));
  return <span className="text-small text-muted-foreground">{durationText(session.workedMs + running)}</span>;
}

/**
 * "Claude's progress" (`session.html`): why the session couldn't start when it couldn't, then each step
 * in its words, the latest one still running (AC-4, AC-13), then the follow-up box (spec 013). The box sticks
 * to the window's bottom while the pane is taller than the window (spec 013, Q6b).
 */
export function SessionProgress({ session, footer }: { session: Session; footer?: ReactNode }) {
  const problem = session.problem === null ? null : problemWords(session.problem, session);
  // Focus comes here once you've answered the last call waiting for you (spec 012, AC-18).
  const pane = useRef<HTMLElement>(null);
  // The step shown in full, by its id, so it follows the session as it changes.
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = session.activities.find((activity) => activity.id === shownId) ?? null;
  const { end, atEnd, jump } = useFollow(session.updatedAt);
  return (
    <>
      <Panel
        ref={pane}
        tabIndex={-1}
        title="Claude's progress"
        actions={<WorkedFor session={session} />}
        // Clipped without being a scroll box, so the box at its end can stick to the window.
        className="overflow-clip"
      >
        <div className="flex flex-col gap-4 p-4">
          <ApprovalCallout session={session} afterAll={pane} />
          {problem === null ? null : (
            <Callout tone="danger" role="alert" title={problem.title}>
              <span>{withCode(problem.line)}</span>
            </Callout>
          )}
          <ActivityList>
            {session.activities.map((activity) => {
              const words = stepWords(activity);
              const { state, icon } = look(activity);
              return (
                <ActivityStep
                  key={activity.id}
                  state={state}
                  icon={icon}
                  title={titleOf(activity, words.title)}
                  detail={detailOf(activity, words.detail)}
                  onOpen={
                    hasDetails(activity)
                      ? () => {
                          setShownId(activity.id);
                        }
                      : undefined
                  }
                />
              );
            })}
          </ActivityList>
          {/* The steps pass under the follow-up box, on the pane's own colour; Jump to latest sits over it. */}
          <div
            className={
              footer === undefined ? 'sticky bottom-4 h-0' : 'sticky bottom-0 -mx-4 -mb-4 bg-raised px-4 pt-2 pb-4'
            }
          >
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
        </div>
      </Panel>
      {/* Past the pane's end: in view only once you've scrolled to the end of Claude's progress. */}
      <div ref={end} aria-hidden />
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
      <Panel title="Claude's progress">
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
