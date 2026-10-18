import { applyIgnores, makeLineLookup, type Finding } from '../gate.ts';
import { scanSource, spanAt, type SourceLanguage } from '../source-scan.ts';

export const STYLE_GATE_ID = 'style-policy';
const MAP = 'docs/design-map.md';

const SCOPE_PREFIXES = ['packages/ui/src/', 'packages/app/src/', 'apps/web/src/'];
const EXCLUDED = new Set(['packages/ui/src/styles/tokens.css', 'packages/ui/src/styles/theme.css']);
const EXTENSIONS = ['.ts', '.tsx', '.css'];

/** Files the style policy applies to. The theme and token files are where raw values are allowed. */
export function inStyleScope(path: string): boolean {
  return (
    SCOPE_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    EXTENSIONS.some((ext) => path.endsWith(ext)) &&
    !EXCLUDED.has(path)
  );
}

export interface StyleOptions {
  /**
   * The content is a fragment (an Edit's new text), not a whole file. String
   * boundaries are unknown, so every non-comment character is checked, and the
   * two bare-word rules (`shadow`, `rounded`) are skipped to avoid flagging
   * ordinary identifiers. The push gate still checks them on the whole file.
   */
  snippet?: boolean;
}

interface Hit {
  index: number;
  rule: string;
  message: string;
  fix: string;
}

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOUR_UTILITIES =
  'bg|text|border(?:-[xytrblse])?|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|caret';

const SIZE_FIX: Readonly<Record<string, string>> = {
  xs: 'text-label (12/16)',
  sm: 'text-small (14/20)',
  base: 'text-body (16/24)',
  lg: 'text-title (18/28)',
  xl: 'text-title-lg (20/28)',
};

const OMITTED_FIX: Readonly<Record<string, string>> = {
  accent: 'subtle for the grey hover/selected surface (bg-subtle), or info for the ink accent (text-info)',
  'accent-foreground': 'foreground (text-foreground)',
  secondary: 'raised (bg-raised) with border-control for a secondary button',
  'secondary-foreground': 'foreground (text-foreground)',
  destructive: 'danger (bg-danger, text-danger)',
  'destructive-foreground': 'on-danger (text-on-danger)',
};

const RADIUS_SIZES = new Set(['xs', 'sm', 'md', 'lg', 'full', 'none']);
const RADIUS_SIDES = new Set(['t', 'r', 'b', 'l', 's', 'e', 'tl', 'tr', 'bl', 'br', 'ss', 'se', 'es', 'ee']);

/** Tailwind class rules. They look at class-like tokens wherever they appear in the checked text. */
function classHits(text: string, snippet: boolean): Hit[] {
  const hits: Hit[] = [];
  const add = (regex: RegExp, make: (m: RegExpExecArray) => Omit<Hit, 'index'> | null): void => {
    for (const m of text.matchAll(regex)) {
      const made = make(m);
      if (made) hits.push({ index: m.index, ...made });
    }
  };

  // Arbitrary VALUES are banned; arbitrary VARIANTS are fine. A bracket group followed by ":" is a variant
  // (data-[state=open]:, [&_svg]:, has-[input:checked]:); only a bracket group in the final utility segment
  // is a value (p-[13px], hover:bg-[#fff], content-['']).
  const arbitraryFix = `use the nearest scale step (p-2.5 = 10px) or a theme token from ${MAP}; if it is truly needed, add "// style-policy-ignore-next-line: <reason>"`;
  add(/(?<![\w-])((?:[A-Za-z0-9_!][A-Za-z0-9_:!/-]*)?[A-Za-z0-9])-\[([^\]\s]+)\](?![:\w-])/g, (m) => ({
    rule: 'arbitrary-value',
    message: `arbitrary value "${m[0]}"`,
    fix: arbitraryFix,
  }));
  // Arbitrary properties: [mask-type:luminance] as the final segment.
  add(/(?<![\w\]-])\[([a-z][a-z-]*):([^\]\s]+)\](?![:\w-])/g, (m) => ({
    rule: 'arbitrary-value',
    message: `arbitrary property "${m[0]}"`,
    fix: arbitraryFix,
  }));

  add(new RegExp(`(?<![\\w-])(?:${COLOUR_UTILITIES})-(?:${PALETTE})-\\d{2,3}(?![\\w-])`, 'g'), (m) => ({
    rule: 'default-palette',
    message: `"${m[0]}" is from Tailwind's default palette, which this theme removes (it renders nothing)`,
    fix: `use a semantic colour from ${MAP}, e.g. text-muted-foreground, bg-subtle, border-border, text-danger`,
  }));

  add(new RegExp(`(?<![\\w-])(?:${COLOUR_UTILITIES})-(?:white|black)(?![\\w-])`, 'g'), (m) => ({
    rule: 'default-palette',
    message: `"${m[0]}" is not a theme colour`,
    fix: `use bg-raised or bg-canvas for surfaces, text-foreground or text-primary-foreground for text (${MAP})`,
  }));

  add(/(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g, (m) => {
    const size = m[1] ?? '';
    return {
      rule: 'default-type-size',
      message: `"${m[0]}" is a Tailwind default size; DevHub type sizes are named`,
      fix: `use ${SIZE_FIX[size] ?? 'text-display (40/48, the Home greeting only)'} — see ${MAP}, Type`,
    };
  });

  add(/(?<![\w-])shadow(?:-(2xs|xs|sm|md|lg|xl|2xl))?(?![\w-])/g, (m) => {
    if (snippet && m[1] === undefined) return null;
    return {
      rule: 'default-shadow',
      message: `"${m[0]}" is not a DevHub shadow`,
      fix: `use shadow-overlay (menus, popovers, the composer only); cards use border-border, not a shadow (${MAP})`,
    };
  });

  add(/(?<![\w-])rounded(?:-([a-z0-9]+))?(?:-([a-z0-9]+))?(?![\w-])/g, (m) => {
    const first = m[1];
    const second = m[2];
    if (first === undefined) {
      if (snippet) return null;
      return radiusHit(m[0], "bare rounded uses Tailwind's default radius");
    }
    if (second === undefined) {
      if (RADIUS_SIZES.has(first)) return null;
      if (RADIUS_SIDES.has(first)) return radiusHit(m[0], 'a side radius needs a size');
      return radiusHit(m[0], `"${first}" is not a DevHub radius`);
    }
    if (RADIUS_SIDES.has(first) && RADIUS_SIZES.has(second)) return null;
    return radiusHit(m[0], `"${m[0]}" is not a DevHub radius`);
  });

  add(/(?<![\w-])dark:(?=[a-z!*[])/g, () => ({
    rule: 'dark-variant',
    message: `"dark:" variant`,
    fix: `remove it — tokens switch light and dark through data-theme on <html> (${MAP}, Colour)`,
  }));

  add(
    /(?<![\w-])(?:bg|text|border(?:-[xytrblse])?|ring|outline|fill|stroke|divide|decoration|caret|from|via|to)-((?:accent|secondary|destructive)(?:-foreground)?)(?![\w-])/g,
    (m) => {
      const name = m[1] ?? '';
      return {
        rule: 'omitted-shadcn-name',
        message: `"${m[0]}" uses the shadcn name "${name}", which this theme leaves out on purpose`,
        fix: `use ${OMITTED_FIX[name] ?? 'the DevHub name'} — see ${MAP}, "Why there is no accent"`,
      };
    },
  );

  return hits;
}

function radiusHit(token: string, why: string): Omit<Hit, 'index'> {
  return {
    rule: 'default-radius',
    message: `"${token}": ${why}`,
    fix: `use rounded-sm (controls), rounded-md (cards, menus), rounded-lg (composer, dialogs), rounded-xs (inner marks) or rounded-full (${MAP})`,
  };
}

/**
 * Colour literals. Hex heuristic, documented because it is a heuristic:
 * - only 3, 4, 6 or 8 hex digits that end the token count (#12345 never does);
 * - `&#123;` entities, anchors in href/to/id strings and "PR #2836"-style
 *   references (all digits, right after a word and a space) are skipped;
 * - in TS files outside snippet mode only text inside string literals is
 *   checked (class names, style values and CSS-in-JS live in strings);
 *   private fields (`this.#add`, `#feed = 1`) are skipped in snippet mode.
 */
function colourHits(text: string, isCandidate: (index: number) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g)) {
    const index = m.index;
    if (!isCandidate(index)) continue;
    const before = text.slice(Math.max(0, index - 12), index);
    if (before.endsWith('&')) continue;
    if (/(?:href|to|id|hash)\s*[=:]\s*["'`{]*$/.test(before)) continue;
    if (/^\d+$/.test(m[1] ?? '') && /[A-Za-z0-9] $/.test(before)) continue;
    if (before.endsWith('.')) continue;
    const after = /^\s*(.)/.exec(text.slice(index + m[0].length))?.[1];
    if (/(^|\s)$/.test(before) && (after === '=' || after === '(')) continue;
    hits.push({
      index,
      rule: 'raw-colour',
      message: `raw colour "${m[0]}"`,
      fix: `use a theme colour class (bg-raised, text-muted-foreground, text-danger …) or var(--token) from tokens.css — see ${MAP}`,
    });
  }
  for (const m of text.matchAll(/\b(rgba?|hsla?|oklch|oklab|hwb|lch|lab)\(/g)) {
    if (!isCandidate(m.index)) continue;
    hits.push({
      index: m.index,
      rule: 'colour-function',
      message: `colour function "${m[1] ?? ''}(" — colours come from tokens`,
      fix: `use a theme colour class or var(--token) from tokens.css — see ${MAP}`,
    });
  }
  return hits;
}

/** Checks one file (or, with `snippet`, a fragment of one) against the style policy. */
export function findStyleViolations(path: string, content: string, options: StyleOptions = {}): Finding[] {
  if (!inStyleScope(path)) return [];
  const snippet = options.snippet ?? false;
  const lang: SourceLanguage = path.endsWith('.css') ? 'css' : 'ts';
  const { code, strings } = scanSource(content, lang);
  const lineOf = makeLineLookup(content);
  let hits: Hit[];

  if (lang === 'css') {
    const lineText = (index: number): string => {
      const start = code.lastIndexOf('\n', index - 1) + 1;
      const end = code.indexOf('\n', index);
      return code.slice(start, end === -1 ? code.length : end);
    };
    const lineStart = (index: number): number => code.lastIndexOf('\n', index - 1) + 1;
    // Colours only in declaration values (a ":" earlier on the line), so #id selectors are not flagged.
    const inValue = (index: number): boolean => code.slice(lineStart(index), index).includes(':');
    hits = [
      ...colourHits(code, inValue),
      // Tailwind classes in CSS only appear after @apply.
      ...classHits(code, snippet).filter((hit) => /@apply\b/.test(lineText(hit.index))),
    ];
  } else if (snippet) {
    hits = [...colourHits(code, () => true), ...classHits(code, true)];
  } else {
    const inString = (index: number): boolean => spanAt(strings, index) !== null;
    // Class rules run on string contents only, so identifiers and JSX text are never flagged.
    const stringsOnly = maskOutsideStrings(code, strings);
    hits = [...colourHits(code, inString), ...classHits(stringsOnly, false)];
  }

  const findings = hits
    .sort((a, b) => a.index - b.index)
    .map((hit) => ({ file: path, line: lineOf(hit.index), rule: hit.rule, message: hit.message, fix: hit.fix }));
  return applyIgnores(STYLE_GATE_ID, path, content, findings);
}

/** Keeps string contents and blanks everything else (newlines kept), so offsets still line up. */
function maskOutsideStrings(code: string, strings: readonly (readonly [number, number])[]): string {
  const out = code.replace(/[^\n]/g, ' ').split('');
  for (const [start, end] of strings) {
    for (let k = start; k < end; k++) out[k] = code.charAt(k);
  }
  return out.join('');
}
