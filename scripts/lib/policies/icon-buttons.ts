import { applyIgnores, makeLineLookup, type Finding } from '../gate.ts';

/**
 * Spec 020: every icon-only button shows its words in a tooltip, so it is drawn with `IconButton` (whose
 * `label` is the tooltip and the name). A Button given an icon size anywhere else has no tooltip.
 */
export const ICON_BUTTONS_GATE_ID = 'icon-buttons';

const SCOPE_PREFIXES = ['packages/ui/src/', 'packages/app/src/'];
/** Where the icon sizes are defined and where IconButton passes them on. */
const OWNERS = new Set(['packages/ui/src/components/button.tsx', 'packages/ui/src/components/icon-button.tsx']);

/** Component files, stories included; tests may exercise Button's sizes on their own. */
export function inIconButtonScope(path: string): boolean {
  return (
    SCOPE_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    path.endsWith('.tsx') &&
    !path.endsWith('.test.tsx') &&
    !OWNERS.has(path)
  );
}

// `size="icon"`, `size={'icon-sm'}` in JSX, and `size: 'icon-sm'` in a buttonVariants call.
const ICON_SIZE = /\bsize(?:=\{?|:\s*)(["'`])(icon(?:-sm)?)\1/g;

export function findIconButtonViolations(path: string, content: string): Finding[] {
  if (!content.includes('icon')) return [];
  const lineOf = makeLineLookup(content);
  const findings: Finding[] = [];
  for (const match of content.matchAll(ICON_SIZE)) {
    findings.push({
      file: path,
      line: lineOf(match.index),
      rule: 'icon-button-without-tooltip',
      message: `a button drawn at size "${match[2] ?? 'icon'}" outside IconButton has no tooltip, so a sighted user can't tell what it does`,
      fix: 'draw it as <IconButton label="…"> from @devhub/ui (its label is the tooltip and the name); put a link or another control in <Tooltip label="…">; if it shows words, add "// icon-buttons-ignore-next-line: <reason>"',
    });
  }
  return applyIgnores(ICON_BUTTONS_GATE_ID, path, content, findings);
}
