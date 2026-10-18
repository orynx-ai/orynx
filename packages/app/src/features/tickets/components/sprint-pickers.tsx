import { useState } from 'react';
import type { Sprint, TicketsChoice } from '@devhub/contracts';
import {
  Combobox,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Picker,
  Skeleton,
} from '@devhub/ui';
import { useJiraConnection, useJiraProjects } from '../../settings/queries.ts';
import { useNow } from '../../../words/use-now.ts';
import { useChooseTicketsSprint, useTicketsSprints } from '../queries.ts';
import { noOpenSprintsText, noSprintName, openSprintLine, yourSprintText } from '../ticket-words.ts';

/**
 * Tickets' Project and Sprint pickers (spec 020). Project searches the Jira projects you can see, with Your
 * sprint first (AC-38); picking one shows its current sprint. Sprint lists that project's active then future
 * sprints, asked of Jira when it opens; picking one holds it. With Your sprint, Sprint lists the sprint's own
 * project when its board has one. No sprint ends the list (AC-39): the picked project's tickets in no sprint,
 * or with Your sprint, your own.
 */
export function SprintPickers({ choice, sprint }: { choice: TicketsChoice; sprint: Sprint | null }) {
  const jira = useJiraConnection();
  const projects = useJiraProjects(jira.data !== undefined && jira.data.saved !== null);
  const choose = useChooseTicketsSprint();
  // Whose sprints the Sprint menu lists: the picked project, or Your sprint's own.
  const project = choice.projectKey ?? sprint?.projectKey ?? null;

  return (
    <>
      <Combobox
        options={[
          { value: '', label: yourSprintText },
          ...(projects.data?.projects ?? []).map((found) => ({
            value: found.key,
            label: `${found.key} · ${found.name}`,
          })),
        ]}
        value={choice.projectKey ?? ''}
        onValueChange={(key) => {
          choose.mutate({ projectKey: key === '' ? null : key, sprintId: null });
        }}
        searchLabel="Search projects"
        emptyText="No projects match"
      >
        <Picker>
          <span className="text-muted-foreground">Project</span> {choice.projectKey ?? yourSprintText}
        </Picker>
      </Combobox>
      <SprintMenu
        project={project}
        current={choice.sprintId ?? sprint?.id ?? null}
        name={choice.sprintId === 'none' ? noSprintName : (sprint?.name ?? null)}
        onPick={(sprintId) => {
          // No sprint keeps Your sprint's "yours"; a sprint belongs to the project listed.
          if (sprintId === 'none') choose.mutate({ projectKey: choice.projectKey, sprintId });
          else if (project !== null) choose.mutate({ projectKey: project, sprintId });
        }}
      />
    </>
  );
}

function SprintMenu({
  project,
  current,
  name,
  onPick,
}: {
  project: string | null;
  current: number | 'none' | null;
  name: string | null;
  onPick: (sprintId: number | 'none') => void;
}) {
  const [open, setOpen] = useState(false);
  const sprints = useTicketsSprints(project, open);
  const now = useNow();

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <Picker>
          <span className="text-muted-foreground">Sprint</span> {name ?? '–'}
        </Picker>
      </MenuTrigger>
      <MenuContent heading="Sprint" align="start">
        {project === null ? null : sprints.isPending ? (
          <div role="status" className="flex flex-col gap-1 p-1.5">
            <span className="sr-only">Loading sprints</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sprints.isError ? (
          <>
            <MenuLabel>Sprints didn&apos;t load.</MenuLabel>
            <MenuItem
              onSelect={(event) => {
                // Stays open, so the sprints show here once they load.
                event.preventDefault();
                void sprints.refetch();
              }}
            >
              Try again
            </MenuItem>
          </>
        ) : sprints.data.sprints.length === 0 ? (
          <MenuLabel>{noOpenSprintsText(project)}</MenuLabel>
        ) : null}
        <MenuRadioGroup
          value={current === null ? '' : String(current)}
          onValueChange={(value) => {
            onPick(value === 'none' ? 'none' : Number(value));
          }}
        >
          {project === null || !sprints.isSuccess
            ? null
            : sprints.data.sprints.map((found) => (
                <MenuRadioItem key={found.id} value={String(found.id)} description={openSprintLine(found, now)}>
                  {found.name}
                </MenuRadioItem>
              ))}
          {project === null ? null : <MenuSeparator />}
          <MenuRadioItem value="none">{noSprintName}</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
