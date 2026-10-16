export interface Protection {
  protected: boolean;
  reason: string;
}

const GENERATED = 'it is generated from CLAUDE.md: edit the rules block in CLAUDE.md, then run `pnpm agent-rules`';
const LOCKFILE = 'change dependencies with `pnpm add` / `pnpm remove`, never by hand';
const FROM_PEOPLE = 'it comes from people (the design system or the product spec): stop and ask';
const SECRETS =
  'secrets never go in files the agent writes; list settings in .env.example and read them in apps/*/src/config.ts';

const OPEN: Protection = { protected: false, reason: '' };

/** Files an agent must not write. `path` is repo-relative and POSIX. */
export function isProtected(path: string): Protection {
  const clean = path.replace(/^\.\//, '');
  const base = clean.split('/').pop() ?? clean;

  if (clean === 'AGENTS.md' || clean === '.github/copilot-instructions.md' || clean.startsWith('.cursor/rules/')) {
    return { protected: true, reason: `${clean}: ${GENERATED}` };
  }
  if (clean === 'pnpm-lock.yaml') return { protected: true, reason: `${clean}: ${LOCKFILE}` };
  if (
    clean === 'packages/ui/src/styles/tokens.css' ||
    clean.startsWith('docs/design/') ||
    clean === 'docs/product/spec.md'
  ) {
    return { protected: true, reason: `${clean}: ${FROM_PEOPLE}` };
  }
  if ((base === '.env' || base.startsWith('.env.')) && base !== '.env.example') {
    return { protected: true, reason: `${clean}: ${SECRETS}` };
  }
  return OPEN;
}
