import { stepsOf, type Session, type SessionActivity, type SessionStep, type SessionStepItem } from '@devhub/contracts';

/** One of the session's steps in What agent did (spec 048): its activities, and how long they took. */
export interface StepGroup {
  step: SessionStepItem;
  activities: SessionActivity[];
  /** Null while the step goes on (Q8). */
  ms: number | null;
}

type Stamped = SessionActivity & { step: SessionStep; at: string };
const stamped = (activity: SessionActivity): activity is Stamped =>
  activity.step !== undefined && activity.at !== undefined;

/**
 * What agent did, by the session's own steps, in the stepper's order, for the steps that started (spec 048). Each
 * activity lasts until the next one starts; the last until the run ended, or on while Claude works. Claude's finish
 * takes no time, so the wait after it for your follow-up isn't counted; the last one, when it's the last activity,
 * shows after the groups instead (AC-16). An activity whose step
 * the session doesn't have goes with the one before it. Null for the flat list: an Ask, or a session with an activity
 * saved before spec 048, which has no step or time.
 */
export function groupsOf(
  session: Pick<Session, 'mode' | 'steps' | 'workOn' | 'activities' | 'state' | 'endedAt'>,
): StepGroup[] | null {
  const { activities } = session;
  if (session.mode === 'ask' || activities.length === 0) return null;
  if (!activities.every(stamped)) return null;
  const order = stepsOf(session);
  const working = session.state === 'working' || session.state === 'needs_you';
  const groups = new Map<string, StepGroup>();
  let kind = order[0]?.kind;
  activities.forEach((activity, index) => {
    if (order.some((step) => step.kind === activity.step)) kind = activity.step;
    const step = order.find((one) => one.kind === kind);
    const finished = activity.kind === 'finished';
    if (step === undefined || (finished && index === activities.length - 1)) return;
    const next = activities[index + 1]?.at ?? (working ? null : session.endedAt);
    const span = finished ? 0 : next === null ? null : Date.parse(next) - Date.parse(activity.at);
    const group = groups.get(step.kind) ?? { step, activities: [], ms: 0 };
    group.activities.push(activity);
    group.ms = group.ms === null || span === null ? null : group.ms + Math.max(0, span);
    groups.set(step.kind, group);
  });
  return order.flatMap((step) => groups.get(step.kind) ?? []);
}

/** A step's time (Q8): "< 1 min", "18 min", then "1 h 5 min". */
export function stepTimeText(ms: number): string {
  if (ms < 60_000) return '< 1 min';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}
