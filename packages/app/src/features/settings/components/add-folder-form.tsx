import { useEffect, useRef, type KeyboardEvent, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { AddRepositoryRequestSchema, Repository } from '@devhub/contracts';
import { Button, Field, Input, Select } from '@devhub/ui';
import type { z } from 'zod';
import { useAddRepository, useJiraConnection, useJiraProjects } from '../queries.ts';
import { addFolderFormSchema, type AddFolderFormValues } from '../schemas.ts';

export interface AddFolderFormProps {
  id: string;
  onAdded: (folder: Repository) => void;
  onCancel: () => void;
}

/**
 * Settings › Repositories: a folder's path and the Jira project its tickets belong to (spec 005). The
 * server checks the folder on disk; its reason goes under Folder.
 */
export function AddFolderForm({ id, onAdded, onCancel }: AddFolderFormProps) {
  const add = useAddRepository();
  const jira = useJiraConnection();
  const jiraConnected = jira.data !== undefined && jira.data.saved !== null;
  const projects = useJiraProjects(jiraConnected);
  const form = useForm<AddFolderFormValues, unknown, z.output<typeof AddRepositoryRequestSchema>>({
    resolver: zodResolver(addFolderFormSchema),
    defaultValues: { path: '', jiraProject: '' },
  });
  const { errors } = form.formState;

  // Straight to the element: react-hook-form's setFocus waits a tick (spec 003).
  const folderInput = useRef<HTMLInputElement | null>(null);
  const folder = form.register('path');
  useEffect(() => {
    folderInput.current?.focus();
  }, []);

  // A second submit while the first is on its way sends nothing, even before the button shows it waits.
  const sending = useRef(false);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    const done = () => {
      sending.current = false;
    };
    void form.handleSubmit((request) => {
      add.mutate(request, {
        onSuccess: onAdded,
        onError: (error) => {
          if (error.code === 'folder_rejected')
            form.setError('path', { message: error.message }, { shouldFocus: true });
        },
        onSettled: done,
      });
    }, done)(event);
  }

  function cancel() {
    // Once the folder is on its way, closing the form can't stop it from saving.
    if (!add.isPending) onCancel();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancel();
  }

  const projectHelp =
    jira.data !== undefined && !jiraConnected
      ? 'Connect Jira in Connections to pick a project.'
      : projects.isError
        ? "Your Jira projects didn't load. Add the folder without one, or try again later."
        : 'Tickets from this project open in this folder.';
  const formError = add.error && add.error.code !== 'folder_rejected' ? add.error.message : undefined;

  return (
    // Escape anywhere in the form closes it, as Cancel does.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <form
      id={id}
      aria-label="Add a folder"
      noValidate
      onSubmit={submit}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-4 rounded-md border border-border bg-raised p-4"
    >
      <Field
        label="Folder"
        help="The folder's full path, for example ~/code/intranet-web."
        error={errors.path?.message}
      >
        <Input
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          {...folder}
          ref={(element) => {
            folder.ref(element);
            folderInput.current = element;
          }}
        />
      </Field>
      <Field label="Jira project" help={projectHelp}>
        <Select disabled={projects.data === undefined} {...form.register('jiraProject')}>
          <option value="">No Jira project</option>
          {projects.data?.projects.map((project) => (
            <option key={project.key} value={project.key}>
              {project.key} · {project.name}
            </option>
          ))}
        </Select>
      </Field>
      {formError === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" pending={add.isPending}>
          Add folder
        </Button>
        <Button variant="ghost" aria-disabled={add.isPending || undefined} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
