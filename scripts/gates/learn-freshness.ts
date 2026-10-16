import type { Finding, Gate } from '../lib/gate.ts';
import { git, tryGit } from '../lib/repo.ts';

/** The files an explainer page describes: `<!-- learn-sources: a b c -->`. Null when the comment is missing. */
export function parseLearnSources(content: string): string[] | null {
  const m = /<!--\s*learn-sources:\s*([^>]*?)\s*-->/.exec(content);
  if (!m) return null;
  return (m[1] ?? '').split(/\s+/).filter((s) => s.length > 0);
}

/** Last commit time in seconds, or null when the file has never been committed. */
export type CommitTime = (path: string) => number | null;

export function checkLearnPage(
  page: string,
  content: string,
  exists: (path: string) => boolean,
  commitTime: CommitTime,
): Finding[] {
  const sources = parseLearnSources(content);
  if (sources === null) {
    return [
      {
        file: page,
        line: 0,
        rule: 'no-sources',
        message: 'has no learn-sources comment',
        fix: 'add `<!-- learn-sources: path/a.ts path/b.ts -->` naming the code it explains',
      },
    ];
  }
  const findings: Finding[] = [];
  const pageTime = commitTime(page);
  for (const source of sources) {
    if (!exists(source)) {
      findings.push({
        file: page,
        line: 0,
        rule: 'missing-source',
        message: `names ${source}, which does not exist`,
        fix: 'update the learn-sources list and the page',
      });
      continue;
    }
    const sourceTime = commitTime(source);
    if (pageTime !== null && sourceTime !== null && sourceTime > pageTime) {
      findings.push({
        file: page,
        line: 0,
        rule: 'may-be-stale',
        message: `${source} changed after this page; it may be out of date`,
        fix: 're-read the code, update the page (even just to confirm it), and commit them together',
      });
    }
  }
  return findings;
}

const gate: Gate = {
  id: 'learn-freshness',
  description: 'Warns when the code a learn/ page explains changed after the page',
  mode: 'warn',
  when: 'always',
  run(ctx) {
    // Before the first commit nothing has a commit time, so there is nothing to compare yet.
    const hasCommits = tryGit(['rev-parse', '--verify', '-q', 'HEAD'], ctx.root) !== null;
    const commitTime: CommitTime = (path) => {
      if (!hasCommits) return null;
      const out = git(['log', '-1', '--format=%ct', '--', path], ctx.root).trim();
      return out === '' ? null : Number.parseInt(out, 10);
    };
    return ctx.files
      .filter((file) => /^learn\/.+\.md$/.test(file))
      .flatMap((page) => checkLearnPage(page, ctx.read(page), (p) => ctx.exists(p), commitTime));
  },
};

export default gate;
