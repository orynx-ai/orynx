import { parse, stringify } from 'yaml';

/** A `SKILL.md` as Settings › Skills edits it (spec 023, Q7). */
export interface SkillFileContent {
  /** The Name: `metadata.title`, or the folder when the file has none (AC-18). */
  title: string;
  /** "When to use it": `description`, or empty. */
  description: string;
  /** Everything after the frontmatter and the blank line under it. */
  instructions: string;
  /** The whole frontmatter, so a save keeps the keys Orynx doesn't know. */
  frontmatter: Record<string, unknown>;
}

export interface SkillToWrite {
  folder: string;
  title: string;
  description: string;
  instructions: string;
}

/** The frontmatter between the first line `---` and the next one, and the rest. */
const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A value as trimmed text: a folded YAML value (`>`) ends with a line break. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Reads a `SKILL.md`, or null when Orynx can't (AC-17): no frontmatter, YAML that doesn't parse (a repeated key
 * included), or frontmatter that isn't a map. `folder` names a skill whose file has no title.
 */
export function readSkillFile(file: string, folder: string): SkillFileContent | null {
  const match = frontmatterPattern.exec(file);
  if (match === null) return null;
  let frontmatter: unknown;
  try {
    frontmatter = parse(match[1] ?? '');
  } catch {
    return null;
  }
  if (!isMap(frontmatter)) return null;
  const metadata = isMap(frontmatter['metadata']) ? frontmatter['metadata'] : {};
  return {
    title: text(metadata['title']) ?? folder,
    description: text(frontmatter['description']) ?? '',
    instructions: (match[2] ?? '').replace(/^\r?\n/, ''),
    frontmatter,
  };
}

/**
 * Writes a `SKILL.md`: Claude Code's `name` (the folder) and `description` first, the keys of `before` that Orynx
 * doesn't know after them, the Name under `metadata.title`, a blank line, then the instructions as written.
 */
export function writeSkillFile(skill: SkillToWrite, before: Record<string, unknown>): string {
  const { name: _name, description: _description, metadata, ...rest } = before;
  const frontmatter = {
    name: skill.folder,
    description: skill.description,
    ...rest,
    metadata: { ...(isMap(metadata) ? metadata : {}), title: skill.title },
  };
  // No folding: a long description stays on one line, as people write them.
  return `---\n${stringify(frontmatter, { lineWidth: 0 })}---\n\n${skill.instructions}`;
}
