import type { SessionSummary } from '@devhub/contracts';
import { Skeleton, StatTiles } from '@devhub/ui';
import { useNow } from '../../../words/use-now.ts';

/** Spec 057, Q9. */
export const spendWords = {
  label: 'Spend',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  sessions: (count: number) => (count === 1 ? '1 session' : `${String(count)} sessions`),
  cost: (usd: number) => `≈ $${usd.toFixed(2)}`,
};

/** Midnight starting today, this week (Monday) and this month, on the laptop's clock. */
function startsOf(now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return { today, week, month: new Date(now.getFullYear(), now.getMonth(), 1) };
}

/**
 * The Sessions page's spend (spec 057, E, Q7): what your sessions cost today, this week and this month, each session's
 * whole cost on the day it started, whatever the filters. While the sessions load, the tiles keep their place.
 */
export function SpendTiles({ sessions }: { sessions: readonly SessionSummary[] | undefined }) {
  const now = useNow();
  const starts = startsOf(now);
  const since = (from: Date) => {
    const started = (sessions ?? []).filter(
      (session) => session.startedAt !== null && Date.parse(session.startedAt) >= from.getTime(),
    );
    const cost = started.reduce((sum, session) => sum + (session.costUsd ?? 0), 0);
    return sessions === undefined ? (
      <Skeleton className="h-10 w-24" />
    ) : (
      <>
        {spendWords.cost(cost)}{' '}
        <span className="block text-small font-normal text-muted-foreground">
          {spendWords.sessions(started.length)}
        </span>
      </>
    );
  };
  return (
    <div role="group" aria-label={spendWords.label} aria-busy={sessions === undefined || undefined}>
      <StatTiles
        items={[
          { term: spendWords.today, detail: since(starts.today) },
          { term: spendWords.week, detail: since(starts.week) },
          { term: spendWords.month, detail: since(starts.month) },
        ]}
      />
    </div>
  );
}
