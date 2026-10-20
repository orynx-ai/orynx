import {
  mostSessionSteps,
  SessionStepsSchema,
  stepsOf,
  type SessionActivity,
  type SessionActivityState,
  type SessionStep,
  type SessionStepItem,
} from '@devhub/contracts';
import type { AgentWork } from '../agents/agent-adapter.ts';

/**
 * "Claude's progress" and the stepper (spec 011, AC-4, AC-7). Claude's tool calls arrive one by one; the
 * screen shows them grouped by the kind of work, the latest group running until another kind starts.
 * Pure, so every rule here is tested as a table.
 */

/** One piece of Claude's work, as the SDK reader sees it once a tool call has succeeded or been refused. */
export type ClaudeWork = AgentWork;

type WithoutPlace<T> = T extends unknown ? Omit<T, 'id' | 'state'> : never;
/** A step before it has its place in the list. */
export type NewStep = WithoutPlace<SessionActivity>;

export interface Progress {
  /** Where the stepper is. */
  step: SessionStep;
  activities: readonly SessionActivity[];
  /** The steps the stepper passed over when Claude finished without them (spec 031, Q5); none when left out. */
  skipped?: readonly SessionStep[];
  /** The session's own steps, in order (spec 042); none for a session from before, which has the five. */
  steps?: readonly SessionStepItem[];
}

export const emptyProgress: Progress = { step: 'plan', activities: [] };

/** Every session's steps before spec 042, still the order of one saved then. */
const fiveSteps: readonly SessionStep[] = ['plan', 'build', 'test', 'review', 'pull_request'];

function orderOf(progress: Progress): readonly SessionStep[] {
  return progress.steps === undefined || progress.steps.length === 0
    ? fiveSteps
    : progress.steps.map((step) => step.kind);
}

/**
 * The stepper only moves forward (Q9b), and only to a step the session has (spec 042): a run session that edits
 * stays where it is until Claude adds a Build.
 */
function atLeast(progress: Progress, wanted: SessionStep): SessionStep {
  const order = orderOf(progress);
  return order.indexOf(wanted) > order.indexOf(progress.step) ? wanted : progress.step;
}

/** The steps strictly between the current one and `to`, which moving there passes over. */
function passedOver(progress: Progress, to: SessionStep): SessionStep[] {
  const order = orderOf(progress);
  return order.slice(order.indexOf(progress.step) + 1, Math.max(0, order.indexOf(to)));
}

/** Where finishing takes the stepper: Review, or Answer, else the last step before a pull request (spec 042). */
function finishedAt(progress: Progress): SessionStep {
  const order = orderOf(progress);
  return (
    order.find((kind) => kind === 'review' || kind === 'answer') ??
    order.findLast((kind) => kind !== 'pull_request') ??
    progress.step
  );
}

/** Whatever was running is done now, except a call still waiting for you: that runs until it's answered. */
function allDone(activities: readonly SessionActivity[]): SessionActivity[] {
  return activities.map((activity) =>
    activity.state === 'running' && activity.kind !== 'waiting' ? { ...activity, state: 'done' } : activity,
  );
}

/** The next step's id: one past the highest shown, so a removed waiting step's id is never reused while it matters. */
function nextId(activities: readonly SessionActivity[]): string {
  const highest = Math.max(0, ...activities.map((activity) => Number(activity.id.slice('step-'.length)) || 0));
  return `step-${String(highest + 1)}`;
}

/** Adds a step at the end; whatever was running is done now. */
export function addStep(progress: Progress, step: NewStep, state: SessionActivityState = 'done'): Progress {
  const activities = allDone(progress.activities);
  const added = { ...step, id: nextId(progress.activities), state };
  return { ...progress, activities: [...activities, added] };
}

/** A call that waits for your answer (spec 012): a running step until `removeWaiting`. */
export function addWaiting(
  progress: Progress,
  waiting: { approvalId: string; about: 'command' | 'edit' | 'ticket' | 'server'; text: string | null },
): Progress {
  return addStep(progress, { kind: 'waiting', ...waiting }, 'running');
}

/** Takes away the step of a call that was answered; what it led to comes as work of its own. */
export function removeWaiting(progress: Progress, approvalId: string): Progress {
  const activities = progress.activities.filter(
    (activity) => activity.kind !== 'waiting' || activity.approvalId !== approvalId,
  );
  return activities.length === progress.activities.length ? progress : { ...progress, activities };
}

/** Puts `step` where the step with this id is, done unless said otherwise: a worktree that's now made. */
export function replaceStep(
  progress: Progress,
  id: string,
  step: NewStep,
  state: SessionActivityState = 'done',
): Progress {
  return {
    ...progress,
    activities: progress.activities.map((activity) => (activity.id === id ? { ...step, id, state } : activity)),
  };
}

/**
 * Ends every step: with `last` (stopped, closed, discarded) after them, or none when the session failed. A
 * call still waiting for you was never answered, so its step goes; the session keeps the approval itself.
 */
export function endProgress(progress: Progress, last: NewStep | null): Progress {
  const kept = { ...progress, activities: progress.activities.filter((activity) => activity.kind !== 'waiting') };
  return last === null ? { ...kept, activities: allDone(kept.activities) } : addStep(kept, last);
}

function withLast(progress: Progress, last: SessionActivity): Progress {
  return { ...progress, activities: [...progress.activities.slice(0, -1), last] };
}

function adding(files: readonly string[], file: string | null): string[] {
  return file === null || files.includes(file) ? [...files] : [...files, file];
}

/**
 * A follow-up starts Claude again (spec 013, Q3a): after Review the stepper goes back to Build, the one time it
 * moves backwards, and so it does once the pull request is open (spec 014, AC-19). From there it moves on as before.
 */
export function resumeProgress(progress: Progress): Progress {
  // What was passed over lies ahead again (spec 031); a session with no Build stays where it is (spec 042).
  const ended = progress.step === 'review' || progress.step === 'pull_request';
  const back = ended && orderOf(progress).includes('build') ? 'build' : progress.step;
  return { ...progress, step: back, skipped: [] };
}

/**
 * Orynx opened the pull request, or pushed changes to it, on your press (spec 014): a finished step of its own, and
 * the stepper at Pull request, the last of the five.
 */
export function addPullRequestStep(
  progress: Progress,
  step: Extract<NewStep, { kind: 'pull_request' | 'pushed' }>,
): Progress {
  const added = { ...addStep(progress, step), step: 'pull_request' as const };
  // A session whose steps had no pull request gains it, while there's room (spec 042).
  const own = progress.steps ?? [];
  if (own.length === 0 || own.some((one) => one.kind === 'pull_request')) return added;
  if (own.length >= mostSessionSteps) return { ...added, step: progress.step };
  return { ...added, steps: [...own, { kind: 'pull_request', label: 'Pull request' }] };
}

/** A server's step (spec 042): a port opening moves the stepper to Run, where the session has one. */
export function addServerStep(progress: Progress, step: Extract<NewStep, { kind: 'server' }>): Progress {
  const added = addStep(progress, step);
  return step.event === 'started' && step.port !== null ? { ...added, step: atLeast(progress, 'run') } : added;
}

/** The kinds only Orynx or you move (spec 042, Assumptions 3): Claude may move the stepper past none of them. */
const notClaudes: Partial<Record<SessionStep, string>> = {
  run: 'Only Orynx moves a run step, once a port opens.',
  answer: 'Only Orynx moves an answer step, when you finish.',
  review: 'Only Orynx moves a review step, when you finish.',
  pull_request: 'Only you move a pull_request step.',
};

export type StepsChange =
  | { ok: true; progress: Progress }
  /** In words Claude can act on, so it can send a better list. */
  | { ok: false; reason: string };

/**
 * Claude's `set_steps` (spec 042): the whole list again, and where the stepper is. Steps done or under way keep their
 * place and words; the rest may change within the rules. A refused change changes nothing.
 */
export function changeSteps(
  progress: Progress,
  change: { steps: readonly SessionStepItem[]; current: SessionStep; reason: string },
): StepsChange {
  const before = stepsOf({ steps: [...(progress.steps ?? [])], workOn: 'new_branch' });
  // A pull request's words are Orynx's, so they match the page bar's button: Claude gives only its kind.
  const pullLabel = before.find((step) => step.kind === 'pull_request')?.label ?? 'Pull request';
  const parsed = SessionStepsSchema.safeParse(
    change.steps.map((step) => (step.kind === 'pull_request' ? { ...step, label: pullLabel } : step)),
  );
  if (!parsed.success) return { ok: false, reason: parsed.error.issues.map((issue) => issue.message).join(' ') };
  const after = parsed.data;
  const at = before.findIndex((step) => step.kind === progress.step);
  const kept = before.slice(0, at + 1);
  const same = (a: SessionStepItem | undefined, b: SessionStepItem) => a?.kind === b.kind && a.label === b.label;
  if (!kept.every((step, index) => same(after[index], step)))
    return {
      ok: false,
      reason: `Steps done or under way stay as they are: ${kept.map((step) => step.label).join(' · ')}.`,
    };
  const to = after.findIndex((step) => step.kind === change.current);
  if (to === -1) return { ok: false, reason: 'The current step must be one of the steps.' };
  if (to < at) return { ok: false, reason: 'The current step can only move forward.' };
  // Claude may pass over the current step, but not land on or pass a step only Orynx or you move.
  const passed = after.slice(at + 1, to + 1).find((step) => notClaudes[step.kind] !== undefined);
  if (passed !== undefined) return { ok: false, reason: notClaudes[passed.kind] ?? '' };
  const moved = { ...progress, steps: after, step: change.current };
  return {
    ok: true,
    progress: addStep(moved, { kind: 'steps_changed', from: before, to: after, reason: change.reason }),
  };
}

export function addWork(progress: Progress, work: ClaudeWork): Progress {
  const running = progress.activities.at(-1)?.state === 'running' ? progress.activities.at(-1) : undefined;
  switch (work.kind) {
    case 'explore':
      return running?.kind === 'explore'
        ? withLast(progress, { ...running, files: adding(running.files, work.file) })
        : addStep(progress, { kind: 'explore', files: adding([], work.file) }, 'running');
    case 'edit': {
      const next =
        running?.kind === 'edit'
          ? withLast(progress, { ...running, files: adding(running.files, work.file) })
          : addStep(progress, { kind: 'edit', files: [work.file] }, 'running');
      return { ...next, step: atLeast(progress, 'build') };
    }
    case 'plan': {
      // Claude ticks its to-do list as it goes: that changes the plan, not what Claude is doing now.
      const plan = progress.activities.find((activity) => activity.kind === 'plan');
      if (plan === undefined) return addStep(progress, { kind: 'plan', items: [...work.items] }, 'running');
      return {
        ...progress,
        activities: progress.activities.map((activity) =>
          activity === plan ? { ...plan, items: [...work.items] } : activity,
        ),
      };
    }
    case 'refused':
      return addStep(progress, { kind: 'refused', ...work.refusal });
    case 'command': {
      const next =
        running?.kind === 'command'
          ? withLast(progress, { ...running, commands: [...running.commands, work.command] })
          : addStep(progress, { kind: 'command', commands: [work.command] }, 'running');
      // Test is reached by a command once Claude has built something; before any edit, a command is setting up, or
      // planning where the session has no Set up.
      const edited = progress.activities.some((activity) => activity.kind === 'edit');
      return { ...next, step: atLeast(progress, edited ? 'test' : 'setup') };
    }
    case 'denied':
      return addStep(progress, { kind: 'denied', about: work.about, text: work.text });
    case 'no_commands':
      return addStep(progress, { kind: 'no_commands', reason: 'no_sandbox' });
    case 'ticket': {
      // A ticket tool's call is a step of its own; it moves the stepper nowhere (spec 037).
      const { done } = work;
      return addStep(progress, {
        kind: 'ticket',
        action: done.action,
        key: done.action === 'listed' ? null : done.key,
        title: done.action === 'listed' ? null : done.title,
        fields: done.action === 'updated' ? done.fields : [],
        status: done.action === 'updated' ? done.status : null,
      });
    }
    case 'finished': {
      const to = atLeast(progress, finishedAt(progress));
      return {
        ...addStep(progress, { kind: 'finished', summary: work.summary }),
        step: to,
        skipped: [...(progress.skipped ?? []), ...passedOver(progress, to)],
      };
    }
  }
}
