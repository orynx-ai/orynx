import type { SessionSource } from '@devhub/contracts';

/** How a session's source reads under its title: `PROJ-1423` or `PR #2836`. */
export function sourceLabel(source: SessionSource | null): string | undefined {
  if (source === null) return undefined;
  return source.kind === 'jira' ? source.key : `PR #${String(source.number)}`;
}
