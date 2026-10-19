import { useForm } from 'react-hook-form';
import type { SkillEntry, SkillFolder } from '@devhub/contracts';
import { ListNav, ListNavItem, SearchField } from '@devhub/ui';

export interface SkillListProps {
  skills: readonly SkillEntry[];
  /** The open skill's folder; none while a new skill is open. */
  current: SkillFolder | null;
  onPick: (folder: SkillFolder) => void;
  /** Each item's button, so focus can move to a skill (after a delete, AC-10). */
  itemRef?: (folder: SkillFolder, button: HTMLButtonElement | null) => void;
  className?: string;
}

/** What a skill is found by: its Name and when to use it, or the folder of one Orynx can't read. */
function searchText(skill: SkillEntry): string {
  return (skill.state === 'ready' ? `${skill.title}\n${skill.description}` : skill.folder).toLowerCase();
}

/**
 * Settings › Skills' list (spec 023): each skill's Name and when to use it, the open one current, under Search
 * skills, which keeps the skills that hold what you type (AC-4). The open skill stays open while you search.
 */
export function SkillList({ skills, current, onPick, itemRef, className }: SkillListProps) {
  const form = useForm({ defaultValues: { query: '' } });
  const query = form.watch('query').trim();
  const shown = query === '' ? skills : skills.filter((skill) => searchText(skill).includes(query.toLowerCase()));

  return (
    <ListNav
      aria-label="Your skills"
      className={className}
      search={
        <form
          role="search"
          aria-label="Search skills"
          onSubmit={(event) => {
            // The list follows each key, so Enter has nothing left to do.
            event.preventDefault();
          }}
        >
          <SearchField
            size="sm"
            aria-label="Search skills"
            placeholder="Search skills"
            className="w-full"
            {...form.register('query')}
          />
        </form>
      }
      empty={`No skills match “${query}”.`}
    >
      {shown.map((skill) => (
        <ListNavItem
          key={skill.folder}
          label={skill.state === 'ready' ? skill.title : skill.folder}
          description={skill.state === 'ready' ? skill.description : "Orynx can't read this skill."}
          current={skill.folder === current}
          ref={(button) => {
            itemRef?.(skill.folder, button);
          }}
          onClick={() => {
            onPick(skill.folder);
          }}
        />
      ))}
    </ListNav>
  );
}
