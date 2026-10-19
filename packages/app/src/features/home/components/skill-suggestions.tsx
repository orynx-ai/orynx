import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BookOpen01Icon } from '@hugeicons/core-free-icons';
import { composerLimits, skillsNamedIn, type Skill } from '@devhub/contracts';
import { Icon, SuggestionList, type SuggestionOption } from '@devhub/ui';
import { composerWords } from '../composer-words.ts';
import { useSkills } from '../queries.ts';

const words = composerWords.skills;

/** The `/name` being typed: where its `/` is, and what follows it so far. */
interface Slash {
  start: number;
  query: string;
}

/**
 * The `/name` the caret ends, when it starts the box or follows a space or a line (AC-49); null otherwise, as for a
 * `/` inside a path or a link.
 */
function slashAt(value: string, caret: number): Slash | null {
  const before = value.slice(0, caret);
  const match = /(?:^|\s)\/([A-Za-z0-9._:-]*)$/.exec(before);
  if (match === null) return null;
  const query = match[1] ?? '';
  return { start: caret - query.length - 1, query };
}

/** Skills whose names start with what's typed, then those that hold it, each in the list's own order. */
function matching(skills: readonly Skill[], query: string): Skill[] {
  const typed = query.toLowerCase();
  const starts = skills.filter((skill) => skill.name.toLowerCase().startsWith(typed));
  const holds = skills.filter((skill) => !starts.includes(skill) && skill.name.toLowerCase().includes(typed));
  return [...starts, ...holds];
}

export interface SkillSuggestions {
  /** For the composer's box: what the list is to it, and the keys the list takes while it's open. */
  boxProps: {
    'aria-autocomplete': 'list';
    'aria-controls'?: string | undefined;
    'aria-activedescendant'?: string | undefined;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onSelect: (event: { currentTarget: HTMLTextAreaElement }) => void;
  };
  /** Tells the list what's in the box after a change. */
  track: (box: HTMLTextAreaElement) => void;
  /** The list, under the composer, while it's open. */
  list: ReactNode;
  /** More skills named than a session takes (Q5): Send waits, and the composer says so. */
  tooMany: boolean;
}

/**
 * The composer's `/` list (spec 022, G): `/` at the start of the box, or after a space or a line, opens the shown
 * folder's skills and yours, read the first time. Typing filters them; arrows move, Enter or Tab or a press puts
 * `/name ` in the box, Esc closes it. While it offers a skill, Enter picks rather than sends, and never while an
 * input method is composing.
 */
export function useSkillSuggestions({
  folder,
  text,
  box,
  onChoose,
}: {
  /** The folder the picker shows, or null: yours alone. */
  folder: { id: string; name: string } | null;
  /** What's in the box now. */
  text: string;
  /** The composer's box. */
  box: () => HTMLTextAreaElement | null;
  /** Puts this text in the box, with the caret at `caret`. */
  onChoose: (text: string, caret: number) => void;
}): SkillSuggestions {
  const listId = useId();
  const [slash, setSlash] = useState<Slash | null>(null);
  // Where Esc closed the list; it stays closed for that `/` until another one starts.
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const open = slash !== null && slash.start !== closedAt;
  const skills = useSkills(folder?.id ?? null, open);
  const all = skills.data?.skills ?? [];
  const shown = slash === null ? [] : matching(all, slash.query);
  const optionId = (name: string) => `${listId}-${name}`;
  // With skills to offer and none that match, the list goes (AC-54); with none at all, it says so (AC-55).
  const visible = open && (skills.isPending || skills.isError || all.length === 0 || shown.length > 0);
  const activeSkill = shown[Math.min(active, shown.length - 1)];

  function track(element: HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, value } = element;
    const next = selectionStart === selectionEnd ? slashAt(value, selectionStart) : null;
    if (next?.start === slash?.start && next?.query === slash?.query) return;
    setActive(0);
    if (next?.start !== slash?.start) setClosedAt(null);
    setSlash(next);
  }

  function pick(skill: Skill) {
    const element = box();
    if (slash === null || element === null) return;
    const inserted = `/${skill.name} `;
    const next = `${element.value.slice(0, slash.start)}${inserted}${element.value.slice(element.selectionStart)}`;
    setSlash(null);
    onChoose(next, slash.start + inserted.length);
  }

  // Only skills the folder or you have count, as at Send (AC-54).
  const known = new Set(all.map((skill) => skill.name));
  const tooMany = skillsNamedIn(text).filter((name) => known.has(name)).length > composerLimits.skills;

  const offering = visible && activeSkill !== undefined;
  const options: SuggestionOption[] = shown.map((skill) => ({
    id: optionId(skill.name),
    mark: <Icon icon={BookOpen01Icon} className="text-muted-foreground" />,
    code: `/${skill.name}`,
    title: skill.description ?? '',
    meta:
      skill.source === 'orynx' ? words.orynx : skill.source === 'yours' ? words.yours : (folder?.name ?? words.yours),
  }));

  return {
    track,
    tooMany,
    boxProps: {
      'aria-autocomplete': 'list',
      ...(visible ? { 'aria-controls': listId } : {}),
      ...(offering ? { 'aria-activedescendant': optionId(activeSkill.name) } : {}),
      onSelect: (event) => {
        track(event.currentTarget);
      },
      onKeyDown: (event) => {
        if (!visible || event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          setClosedAt(slash.start);
          return;
        }
        if (!offering) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setActive((Math.min(active, shown.length - 1) + step + shown.length) % shown.length);
          return;
        }
        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
          event.preventDefault();
          pick(activeSkill);
        }
      },
    },
    list: visible ? (
      <SuggestionList
        listId={listId}
        label={words.label}
        options={options}
        activeId={offering ? optionId(activeSkill.name) : null}
        loading={skills.isPending}
        notice={skills.isError ? words.failed : all.length === 0 ? words.empty(folder?.name ?? null) : undefined}
        onPick={(id) => {
          const skill = shown.find((candidate) => optionId(candidate.name) === id);
          if (skill !== undefined) pick(skill);
        }}
        className="absolute inset-x-0 top-full z-20 mt-1"
      />
    ) : null,
  };
}
