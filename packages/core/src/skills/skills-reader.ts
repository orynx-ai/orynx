import { open, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';

/**
 * The skills the composer's `/` list offers (spec 022, G, Q10): a folder's `.claude/skills/<name>/SKILL.md` and
 * `.claude/commands/**.md`, then yours under `~/.claude`, as Claude Code's terminal lists them. Only names and
 * descriptions are read here, from the first 64 KB; a skill's text is read at Send. Nothing is written.
 */
export interface FoundSkill {
  /** What follows `/`: the frontmatter's `name`, else the folder's name; a command's path, folders joined by `:`. */
  name: string;
  description: string | null;
  source: 'folder' | 'yours';
  /** The skill's file, which the brief gives Claude. */
  file: string;
  /** A skill's own folder, which Claude may read (AC-53); null for a command, which is a file on its own. */
  folder: string | null;
}

/** Frontmatter past this is never read: a skill's name and description sit at its top. */
const mostRead = 64 * 1024;
/** Commands sit at most this many folders deep, and a list holds at most this many. */
const deepest = 3;
const mostSkills = 200;
/** A name `/` can be typed with: letters, digits, `-`, `_`, `.` and `:` between folders. */
const skillName = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

interface Frontmatter {
  name: string | null;
  description: string | null;
}

/** The start of a file, as text; null when it can't be read. */
async function head(file: string): Promise<string | null> {
  try {
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(mostRead);
      const { bytesRead } = await handle.read(buffer, 0, mostRead, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/** `name` and `description` from YAML between `---` lines at the top; none without them; null when it won't parse. */
function frontmatterOf(text: string): Frontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (match === null) return { name: null, description: null };
  let read: unknown;
  try {
    read = parse(match[1] ?? '');
  } catch {
    return null;
  }
  if (read === null || typeof read !== 'object') return { name: null, description: null };
  const fields = read as Record<string, unknown>;
  const trimmed = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
  return { name: trimmed(fields['name']), description: trimmed(fields['description']) };
}

async function isFolder(path: string): Promise<boolean> {
  return stat(path).then(
    (found) => found.isDirectory(),
    () => false,
  );
}

async function entries(folder: string): Promise<string[]> {
  return readdir(folder).catch(() => []);
}

/** `.claude/skills/<name>/SKILL.md` under `base`. */
async function skillsIn(base: string, source: FoundSkill['source']): Promise<FoundSkill[]> {
  const root = join(base, '.claude', 'skills');
  const found: FoundSkill[] = [];
  for (const entry of (await entries(root)).sort()) {
    const folder = join(root, entry);
    if (!(await isFolder(folder))) continue;
    const file = join(folder, 'SKILL.md');
    const text = await head(file);
    if (text === null) continue;
    const front = frontmatterOf(text);
    if (front === null) continue;
    found.push({ name: front.name ?? entry, description: front.description, source, file, folder });
  }
  return found;
}

/** `.claude/commands/**.md` under `base`, named by their path with `:` between folders, as Claude Code names them. */
async function commandsIn(base: string, source: FoundSkill['source']): Promise<FoundSkill[]> {
  const root = join(base, '.claude', 'commands');
  const found: FoundSkill[] = [];
  async function walk(folder: string, depth: number): Promise<void> {
    for (const entry of (await entries(folder)).sort()) {
      const path = join(folder, entry);
      if (await isFolder(path)) {
        if (depth < deepest) await walk(path, depth + 1);
        continue;
      }
      if (!entry.endsWith('.md')) continue;
      const text = await head(path);
      if (text === null) continue;
      const front = frontmatterOf(text);
      if (front === null) continue;
      const name = relative(root, path).slice(0, -'.md'.length).split(sep).join(':');
      found.push({ name, description: front.description, source, file: path, folder: null });
    }
  }
  await walk(root, 1);
  return found;
}

/**
 * The folder's skills and commands, then yours (AC-49), by name; the folder's wins on a name you share (AC-58).
 * A name `/` can't be typed with, a file that can't be read or whose frontmatter won't parse is left out (AC-57).
 */
export async function readSkills({ folder, home }: { folder: string | null; home: string }): Promise<FoundSkill[]> {
  const byName = (a: FoundSkill, b: FoundSkill) => a.name.localeCompare(b.name);
  const theFolder =
    folder === null ? [] : [...(await skillsIn(folder, 'folder')), ...(await commandsIn(folder, 'folder'))];
  const yours = [...(await skillsIn(home, 'yours')), ...(await commandsIn(home, 'yours'))];
  const seen = new Set<string>();
  const kept: FoundSkill[] = [];
  for (const skill of [...theFolder.sort(byName), ...yours.sort(byName)]) {
    if (!skillName.test(skill.name) || seen.has(skill.name)) continue;
    seen.add(skill.name);
    kept.push(skill);
  }
  return kept.slice(0, mostSkills);
}
