import { useNavigate } from '@tanstack/react-router';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button, Icon } from '@devhub/ui';
import { plural } from '../../../words/calendar.ts';
import { useSkills } from '../queries.ts';

/**
 * The page bar's end on Settings › Skills (spec 023): "4 skills in ~/.devhub/plugin" and New skill, in place of
 * "Changes save automatically", since a skill saves when you press Save skill. No count until there is a skill.
 */
export function SkillsBarActions() {
  const skills = useSkills().data;
  const navigate = useNavigate();
  const count = skills?.skills.length ?? 0;

  return (
    <>
      {skills === undefined || count === 0 ? null : (
        // Under 768 px the bar has room only for the crumbs and the button.
        <span className="text-small text-muted-foreground max-md:hidden">
          {`${plural(count, 'skill')} in ${skills.pluginFolder}`}
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          void navigate({ to: '/settings/$tab', params: { tab: 'skills' }, search: { new: true } });
        }}
      >
        <Icon icon={PlusSignIcon} aria-hidden />
        New skill
      </Button>
    </>
  );
}
