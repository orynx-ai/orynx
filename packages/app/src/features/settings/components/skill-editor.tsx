import { useEffect, useId, useRef, type ComponentProps } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { folderFromName, SaveSkillRequestSchema, type ReadySkill, type SaveSkillRequest } from '@devhub/contracts';
import { Button, Field, Input, Panel, Skeleton, SourceMark, Textarea } from '@devhub/ui';
import { useAddSkill, useSaveSkill } from '../queries.ts';
import { DeleteSkill } from './delete-skill.tsx';

type SubmitEvent = Parameters<NonNullable<ComponentProps<'form'>['onSubmit']>>[0];

export interface SkillEditorProps {
  /** The open skill; null for New skill. */
  skill: ReadySkill | null;
  /** Where your skills live, as the page bar shows it: "~/.devhub/plugin". */
  pluginFolder: string;
  /** After a save, with the skill as the server wrote it: a rename comes back under its new folder. */
  onSaved: (skill: ReadySkill) => void;
  /** After Delete skill removed it. */
  onDeleted: () => void;
  className?: string;
}

const blank: SaveSkillRequest = { title: '', description: '', instructions: '' };

function fieldsOf(skill: ReadySkill | null): SaveSkillRequest {
  return skill === null
    ? blank
    : { title: skill.title, description: skill.description, instructions: skill.instructions };
}

/** The editor's frame: the head, the fields and the foot, the same for the skeleton. */
const head = 'flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3.5';
const body = 'flex flex-col gap-4.5 p-4';
const nameRow = 'grid gap-4 sm:grid-cols-2';
const foot = 'flex flex-wrap items-center gap-2 border-t border-border bg-sidebar px-4 py-3';

/**
 * Settings › Skills' editor (spec 023): the open skill's Name, its folder (made from the Name as you type, AC-6),
 * when to use it and the instructions, saved with Save skill. Field errors are the contract's words (AC-8); a Name
 * whose folder is taken comes back from the server under Name (AC-7). Changes from another tab show unless you
 * changed the same field here (AC-19).
 */
export function SkillEditor({ skill, pluginFolder, onSaved, onDeleted, className }: SkillEditorProps) {
  const headingId = useId();
  const save = useSaveSkill();
  const add = useAddSkill();
  const sending = save.isPending || add.isPending;
  const form = useForm<SaveSkillRequest, unknown, z.output<typeof SaveSkillRequestSchema>>({
    resolver: zodResolver(SaveSkillRequestSchema),
    values: fieldsOf(skill),
    resetOptions: { keepDirtyValues: true },
  });
  const { errors, isDirty } = form.formState;
  const folder = folderFromName(form.watch('title'));
  const failure = (skill === null ? add : save).error;
  // A second press while the first save is on its way sends nothing.
  const busy = useRef(false);
  const isNew = skill === null;

  // New skill starts in Name (AC-9).
  useEffect(() => {
    if (isNew) form.setFocus('title');
  }, [isNew, form]);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const done = () => {
      busy.current = false;
    };
    const handlers = {
      onSuccess: (saved: ReadySkill) => {
        form.reset(fieldsOf(saved));
        onSaved(saved);
      },
      onError: (error: { code: string; message: string }) => {
        if (error.code === 'skill_rejected') form.setError('title', { message: error.message }, { shouldFocus: true });
      },
      onSettled: done,
    };
    void form.handleSubmit((request) => {
      if (skill === null) add.mutate(request, handlers);
      else save.mutate({ folder: skill.folder, request }, handlers);
    }, done)(event);
  }

  const status = isDirty ? 'Unsaved changes' : skill === null ? '' : 'Saved';
  return (
    <Panel aria-labelledby={headingId} className={className}>
      <form noValidate onSubmit={submit}>
        <div className={head}>
          <SourceMark source="skill" size="lg" label="none" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={headingId} className="m-0 truncate text-title font-medium">
              {skill === null ? 'New skill' : skill.title}
            </h2>
            <span className="truncate font-mono text-code text-muted-foreground">
              {folder === '' ? `${pluginFolder}/skills/` : `${pluginFolder}/skills/${folder}/SKILL.md`}
            </span>
          </div>
        </div>
        <div className={body}>
          <div className={nameRow}>
            <Field
              label="Name"
              help={folder === '' ? 'Shown in this list.' : `Shown in this list. In the composer you type /${folder}.`}
              error={errors.title?.message}
            >
              <Input autoComplete="off" {...form.register('title')} />
            </Field>
            <Field label="Folder name" help="Made from the name. Letters, numbers and dashes.">
              <Input computed value={folder} />
            </Field>
          </div>
          <Field
            label="When to use it"
            help="One sentence. You see it when picking a skill."
            error={errors.description?.message}
          >
            <Textarea rows={2} {...form.register('description')} />
          </Field>
          <Field
            label="Instructions for Claude"
            help="Markdown. Steps, what good output looks like, what not to do."
            error={errors.instructions?.message}
          >
            <Textarea mono {...form.register('instructions')} />
          </Field>
        </div>
        <div className={foot}>
          {skill === null ? null : (
            <DeleteSkill folder={skill.folder} name={skill.title} pluginFolder={pluginFolder} onDeleted={onDeleted} />
          )}
          <span role="status" className="ms-auto text-small text-muted-foreground">
            {status}
          </span>
          <Button type="submit" variant="primary" size="sm" pending={sending}>
            Save skill
          </Button>
          {failure && failure.code !== 'skill_rejected' ? (
            <p role="alert" className="m-0 w-full text-end text-small text-danger">
              The skill wasn&apos;t saved. Try again.
            </p>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}

/** A field's label, its box and its help line, as skeleton blocks of the same heights. */
function FieldSkeleton({ box }: { box: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-24" />
      </div>
      <Skeleton className={`${box} w-full rounded-sm`} />
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-3/5" />
      </div>
    </div>
  );
}

/**
 * The editor while the skills load: its frame with each field's label, box and help line as blocks of the same
 * heights (a 40 px input, a two-line box, the 300 px instructions), so nothing moves when they arrive.
 */
export function SkillEditorSkeleton({ className }: { className?: string }) {
  return (
    <Panel aria-hidden className={className}>
      <div className={head}>
        <Skeleton className="size-10 rounded-sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-7 items-center">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
      </div>
      <div className={body}>
        <div className={nameRow}>
          <FieldSkeleton box="h-10" />
          <FieldSkeleton box="h-10" />
        </div>
        {/* Two lines of 24 px, 8 px above and below, and the border. */}
        <FieldSkeleton box="h-16.5" />
        <FieldSkeleton box="h-75" />
      </div>
      <div className={foot}>
        <Skeleton className="ms-auto h-8 w-24 rounded-sm" />
      </div>
    </Panel>
  );
}
