export interface RunOptions {
  only: string[];
  push: boolean;
  ci: boolean;
  list: boolean;
  skipSelfTest: boolean;
}

export type ParsedArgs = { ok: true; options: RunOptions } | { ok: false; error: string };

/**
 * Flags for scripts/run-gates.ts:
 *   --only <id>[,<id>]  run just these gates (repeatable; `pnpm gate <id>` passes this)
 *   --push              include push-only gates (the pre-push hook)
 *   --ci                running in CI: push-only gates never run
 *   --list              print the gates and exit
 *   --skip-self-test    do not run the gates' own tests first
 */
export function parseRunArgs(argv: readonly string[]): ParsedArgs {
  const options: RunOptions = { only: [], push: false, ci: false, list: false, skipSelfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--only') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { ok: false, error: '--only needs a gate id' };
      options.only.push(...value.split(',').filter((id) => id.length > 0));
      i++;
    } else if (arg.startsWith('--only=')) {
      options.only.push(
        ...arg
          .slice('--only='.length)
          .split(',')
          .filter((id) => id.length > 0),
      );
    } else if (arg === '--push') {
      options.push = true;
    } else if (arg === '--ci') {
      options.ci = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--skip-self-test') {
      options.skipSelfTest = true;
    } else if (!arg.startsWith('--') && options.only.length > 0) {
      // `pnpm gate a b` → --only a b
      options.only.push(arg);
    } else {
      return { ok: false, error: `unknown argument "${arg}"` };
    }
  }
  return { ok: true, options };
}

export interface SelectableGate {
  id: string;
  when: 'always' | 'push';
}

export type Selection<G> = { ok: true; gates: G[]; skipped: string[] } | { ok: false; error: string };

/** Which gates to run. Push-only gates need --push or --only, and never run in CI. */
export function selectGates<G extends SelectableGate>(all: readonly G[], options: RunOptions): Selection<G> {
  const ids = all.map((g) => g.id);
  const unknown = options.only.filter((id) => !ids.includes(id));
  if (unknown.length > 0) {
    return { ok: false, error: `unknown gate "${unknown.join('", "')}". Gates: ${ids.join(', ')}` };
  }
  const skipped: string[] = [];
  const gates = all.filter((gate) => {
    if (options.only.length > 0 && !options.only.includes(gate.id)) return false;
    if (gate.when === 'push') {
      if (options.ci) {
        skipped.push(`${gate.id} (local only, never in CI)`);
        return false;
      }
      if (!options.push && !options.only.includes(gate.id)) return false;
    }
    return true;
  });
  return { ok: true, gates, skipped };
}
