import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The repository's written rules for branch names (spec 042, Q3), for the quick read. Read-only, and only the parts
 * about branches: a section whose heading is about branches, whole, and any other paragraph that says how branches
 * are named. Claude gets these words; Orynx never reads more of the repository than this.
 */

/** The most characters of rules the quick read gets. */
export const mostRuleCharacters = 8_000;
/** A file bigger than this isn't a handbook; it's skipped. */
const mostFileBytes = 256 * 1024;

const handbooks = ['CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/CONTRIBUTING.md'];

const aboutBranches = /branch/i;
const namesBranches =
  /branch(?:es)? nam|nam\w* (?:your |the |a |each )?branch|branch(?:es)? (?:prefix|format|pattern|convention)/i;

/** The text in sections, each under its heading; a `#` inside a code fence is code, not a heading. */
function sectionsOf(text: string): { heading: string; lines: string[] }[] {
  const sections: { heading: string; lines: string[] }[] = [{ heading: '', lines: [] }];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && /^#{1,6}\s/.test(line)) sections.push({ heading: line, lines: [] });
    else sections.at(-1)?.lines.push(line);
  }
  return sections;
}

/** Paragraphs split on blank lines, a code fence kept whole. */
function paragraphsOf(lines: readonly string[]): string[] {
  const paragraphs: string[][] = [[]];
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && line.trim() === '') paragraphs.push([]);
    else paragraphs.at(-1)?.push(line);
  }
  return paragraphs.map((paragraph) => paragraph.join('\n').trim()).filter((paragraph) => paragraph !== '');
}

/** The parts of these files about branch names, each file's under "From <path>:", cut at the limit. */
export function rulesFrom(files: readonly { path: string; text: string }[]): string {
  const parts = files.flatMap(({ path, text }) => {
    const kept = sectionsOf(text).flatMap(({ heading, lines }) =>
      heading !== '' && aboutBranches.test(heading)
        ? [[heading, ...lines].join('\n').trim()]
        : paragraphsOf(lines).filter((paragraph) => namesBranches.test(paragraph)),
    );
    return kept.length === 0 ? [] : [`From ${path}:\n${kept.join('\n\n')}`];
  });
  return parts.join('\n\n').slice(0, mostRuleCharacters);
}

async function readSmall(path: string): Promise<string | null> {
  try {
    const found = await stat(path);
    return found.isFile() && found.size <= mostFileBytes ? await readFile(path, 'utf8') : null;
  } catch {
    return null;
  }
}

/** Reads the handbooks and every `.claude/skills/*\/SKILL.md` in `repo`; "" when none says how to name a branch. */
export async function readBranchRules(repo: string): Promise<string> {
  const skills = await readdir(join(repo, '.claude', 'skills')).catch(() => []);
  const paths = [...handbooks, ...skills.sort().map((skill) => join('.claude', 'skills', skill, 'SKILL.md'))];
  const files = await Promise.all(
    paths.map(async (path) => ({ path, text: (await readSmall(join(repo, path))) ?? '' })),
  );
  return rulesFrom(files.filter((file) => file.text !== ''));
}
