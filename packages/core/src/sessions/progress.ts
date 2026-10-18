import type { SessionActivity, SessionActivityState, SessionStep } from '@devhub/contracts';
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
}

export const emptyProgress: Progress = { step: 'plan', activities: [] };

const stepOrder: readonly SessionStep[] = ['plan', 'build', 'test', 'review', 'pull_request'];

/** The stepper only moves forward (Q9b). */
function atLeast(current: SessionStep, wanted: SessionStep): SessionStep {
  return stepOrder.indexOf(wanted) > stepOrder.indexOf(current) ? wanted : current;
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
  waiting: { approvalId: string; about: 'command' | 'edit'; text: string | null },
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
      return { ...next, step: atLeast(progress.step, 'build') };
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
      // Test is reached by a command once Claude has built something; before any edit, a command is planning.
      return { ...next, step: progress.step === 'plan' ? 'plan' : atLeast(progress.step, 'test') };
    }
    case 'denied':
      return addStep(progress, { kind: 'denied', about: work.about, text: work.text });
    case 'no_commands':
      return addStep(progress, { kind: 'no_commands', reason: 'no_sandbox' });
    case 'finished':
      return {
        ...addStep(progress, { kind: 'finished', summary: work.summary }),
        step: atLeast(progress.step, 'review'),
      };
  }
}
