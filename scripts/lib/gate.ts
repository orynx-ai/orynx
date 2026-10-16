/** One broken rule: where it is, what is wrong and how to fix it. */
export interface Finding {
  file: string;
  /** 1-based line, or 0 when the finding is about the whole file. */
  line: number;
  rule: string;
  message: string;
  fix: string;
}

export interface GateContext {
  root: string;
  /** Repo-relative POSIX paths: tracked plus untracked-but-not-ignored. */
  files: readonly string[];
  read(path: string): string;
  exists(path: string): boolean;
  ci: boolean;
  /** Every registered gate id, so a gate can check references to other gates. */
  gateIds: readonly string[];
}

export interface Gate {
  id: string;
  description: string;
  /** "warn" gates report but never fail the run. */
  mode: 'fail' | 'warn';
  /** "push" gates run only with --push (pre-push hook) or --only. */
  when: 'always' | 'push';
  run(ctx: GateContext): Finding[] | Promise<Finding[]>;
}

export function formatFinding(finding: Finding): string {
  const location = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
  return `  ${location}  ${finding.rule}: ${finding.message}\n    fix: ${finding.fix}`;
}

/** Returns a function that maps a character index in `content` to its 1-based line. */
export function makeLineLookup(content: string): (index: number) => number {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return (index: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

export interface IgnoreScan {
  /** Lines (1-based) whose findings are suppressed. */
  lines: ReadonlySet<number>;
  /** Ignore comments that gave no reason; these are findings themselves. */
  findings: Finding[];
}

/**
 * Finds `<gate-id>-ignore-next-line: <reason>` comments in any comment syntax
 * (`//`, `/* *\/`, `{/* *\/}`, `<!-- -->`, `#`). The reason is required.
 */
export function scanIgnores(gateId: string, file: string, content: string): IgnoreScan {
  const marker = `${gateId}-ignore-next-line`;
  const lines = new Set<number>();
  const findings: Finding[] = [];
  const all = content.split('\n');
  all.forEach((text, index) => {
    const at = text.indexOf(marker);
    if (at === -1) return;
    const reason = text
      .slice(at + marker.length)
      .replace(/^\s*:?/, '')
      .replace(/(\*\/\s*\}?|-->)\s*$/, '')
      .trim();
    if (reason.length === 0) {
      findings.push({
        file,
        line: index + 1,
        rule: 'ignore-without-reason',
        message: `"${marker}" has no reason`,
        fix: `write why the rule does not apply: "// ${marker}: <reason>"`,
      });
      return;
    }
    lines.add(index + 2);
  });
  return { lines, findings };
}

/** Drops findings on lines covered by a reasoned ignore comment, and adds findings for reason-less ignores. */
export function applyIgnores(gateId: string, file: string, content: string, findings: readonly Finding[]): Finding[] {
  if (!content.includes(`${gateId}-ignore-next-line`)) return [...findings];
  const scan = scanIgnores(gateId, file, content);
  return [...findings.filter((f) => !scan.lines.has(f.line)), ...scan.findings];
}

/** An in-memory GateContext for tests. Paths are repo-relative. */
export function memoryContext(
  files: Readonly<Record<string, string>>,
  overrides: Partial<Pick<GateContext, 'ci' | 'gateIds' | 'root'>> = {},
): GateContext {
  return {
    root: overrides.root ?? '/repo',
    files: Object.keys(files).sort(),
    read(path: string): string {
      const text = files[path];
      if (text === undefined) throw new Error(`memoryContext: no file ${path}`);
      return text;
    },
    exists(path: string): boolean {
      const clean = path.replace(/\/$/, '');
      return Object.keys(files).some((f) => f === clean || f.startsWith(`${clean}/`));
    },
    ci: overrides.ci ?? false,
    gateIds: overrides.gateIds ?? [],
  };
}
