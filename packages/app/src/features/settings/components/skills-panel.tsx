import { Book02Icon } from '@hugeicons/core-free-icons';
import { Button, Callout, EmptyState, Icon, ListNav, ListNavItem, ListNavSkeleton } from '@devhub/ui';
import { useAddStarterSkills, useSkills } from '../queries.ts';

/** The list's column: 260 px to 320 px beside the editor, the whole width once they stack. */
const listColumn = 'min-w-0 grow basis-65 md:max-w-80';
/** The editor's column: at least 520 px beside the list, taking the rest. */
const editorColumn = 'min-w-0 grow-3 basis-130';

/**
 * Settings › Skills (spec 023): your skills, a list beside the open one's editor, under the design's callout.
 * The page bar's count and New skill are `SkillsBarActions`.
 */
export function SkillsPanel() {
  const skills = useSkills();
  const starters = useAddStarterSkills();
  const list = skills.data?.skills;

  return (
    <div className="flex flex-col gap-5">
      <Callout
        tone="info"
        icon={<Icon icon={Book02Icon} aria-hidden />}
        title="A skill tells Claude how to do one kind of work"
      >
        <span>
          Claude reads a skill only in a session where you name it with / in the composer. Skills live in your own
          folder, outside your repos and ~/.claude.
        </span>
      </Callout>
      {list === undefined && skills.isError ? (
        <EmptyState
          title="Skills didn't load."
          action={
            <Button size="sm" pending={skills.isFetching} onClick={() => void skills.refetch()}>
              Try again
            </Button>
          }
        />
      ) : list === undefined ? (
        <div className="flex flex-wrap items-start gap-5">
          <ListNavSkeleton rows={3} className={listColumn} />
          <div aria-hidden className={`${editorColumn} h-140 rounded-md border border-border bg-raised`} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="No skills yet."
          action={
            <Button
              variant="secondary"
              size="sm"
              pending={starters.isPending}
              onClick={() => {
                starters.mutate();
              }}
            >
              Add the starter skills
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <ListNav aria-label="Your skills" className={listColumn}>
            {list.map((skill) => (
              <ListNavItem
                key={skill.folder}
                label={skill.state === 'ready' ? skill.title : skill.folder}
                description={skill.state === 'ready' ? skill.description : "Orynx can't read this skill."}
              />
            ))}
          </ListNav>
        </div>
      )}
    </div>
  );
}
