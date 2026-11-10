import { PullRequestRecordSchema } from '../integrations/github/map.ts';

/**
 * Your pull requests whose open review threads changed between two of GitHub's syncs (spec 057, AC-24): one came,
 * went, or got a newer comment that isn't yours. None on the first sync, which has nothing to compare with.
 */
export function pullsWithNewThreads(before: readonly unknown[] | null, after: readonly unknown[]): string[] {
  if (before === null) return [];
  const threadsOf = (records: readonly unknown[]) =>
    new Map(
      records.flatMap((record) => {
        const pull = PullRequestRecordSchema.safeParse(record);
        return pull.success && pull.data.mine ? [[pull.data.id, JSON.stringify(pull.data.unresolved)] as const] : [];
      }),
    );
  const was = threadsOf(before);
  return [...threadsOf(after)].flatMap(([id, threads]) => (was.has(id) && was.get(id) !== threads ? [id] : []));
}
