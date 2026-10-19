import type { SessionRecords } from '../sessions/session-store.ts';

/**
 * How many sessions' briefs named each of your Orynx skills, by folder (spec 023, AC-24). A session counts once per
 * skill; a folder's skill of the same name isn't yours, and a session from before spec 023 recorded none.
 */
export async function orynxSkillUses(records: Pick<SessionRecords, 'list' | 'get'>): Promise<Map<string, number>> {
  const sessions = await Promise.all((await records.list()).map((listed) => records.get(listed.id)));
  const counts = new Map<string, number>();
  for (const record of sessions) {
    const brief = record?.session.activities.find((activity) => activity.kind === 'brief');
    if (brief?.kind !== 'brief') continue;
    for (const folder of new Set(brief.orynxSkills ?? [])) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return counts;
}
