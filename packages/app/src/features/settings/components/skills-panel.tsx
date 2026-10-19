import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Book02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import type { ReadySkill, SkillEntry, SkillFolder } from '@devhub/contracts';
import { Button, Callout, EmptyState, Icon, ListNavSkeleton } from '@devhub/ui';
import { useAddStarterSkills, useSkills } from '../queries.ts';
import type { SettingsSearch } from '../tabs.ts';
import { SkillEditor, SkillEditorSkeleton, UnreadableSkill } from './skill-editor.tsx';
import { SkillList } from './skill-list.tsx';

/** The list's column: 260 px to 320 px beside the editor, the whole width once they stack. */
const listColumn = 'min-w-0 grow basis-65 md:max-w-80';
/** The editor's column: at least 520 px beside the list, taking the rest. */
const editorColumn = 'min-w-0 grow-3 basis-130';

/** The open skill: none for New skill, the one the address names while it's listed, or else the first. */
function openFolder(skills: readonly SkillEntry[], search: SettingsSearch): SkillFolder | null {
  if (search.new === true) return null;
  return skills.find((skill) => skill.folder === search.skill)?.folder ?? skills[0]?.folder ?? null;
}

/** The open skill: a new one (null), one Orynx read, or one it can't; nothing while the list is empty. */
function openSkill(skills: readonly SkillEntry[], search: SettingsSearch): SkillEntry | null | undefined {
  if (search.new === true) return null;
  const folder = openFolder(skills, search);
  return skills.find((entry) => entry.folder === folder);
}

/**
 * Settings › Skills (spec 023): your skills, a list beside the open one's editor, under the design's callout.
 * The page bar's count and New skill are `SkillsBarActions`.
 */
export function SkillsPanel() {
  const skills = useSkills();
  const starters = useAddStarterSkills();
  const search = useSearch({ from: '/settings/$tab' });
  const navigate = useNavigate();
  const list = skills.data?.skills;
  const items = useRef(new Map<SkillFolder, HTMLButtonElement>());
  const startersButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once the list shows it: a skill, the starters when none is left, or nowhere yet.
  const [focusNext, setFocusNext] = useState<SkillFolder | null | undefined>(undefined);

  useEffect(() => {
    if (focusNext === undefined) return;
    const target = focusNext === null ? startersButton.current : items.current.get(focusNext);
    if (target === null || target === undefined) return;
    target.focus();
    setFocusNext(undefined);
  }, [focusNext, list]);

  function open(folder: SkillFolder) {
    void navigate({ to: '/settings/$tab', params: { tab: 'skills' }, search: { skill: folder } });
  }

  /** After a delete, the skill after it opens (the one before when it was last), with focus on it (AC-10). */
  function deleted(folder: SkillFolder) {
    const index = list?.findIndex((skill) => skill.folder === folder) ?? -1;
    const next = list?.[index + 1] ?? list?.[index - 1];
    void navigate({
      to: '/settings/$tab',
      params: { tab: 'skills' },
      search: next === undefined ? {} : { skill: next.folder },
      replace: true,
      // The deleted skill's unsaved changes went with it.
      ignoreBlocker: true,
    });
    setFocusNext(next?.folder ?? null);
  }

  /** A new skill, or a rename, is saved under another folder: the address follows it. */
  function saved(skill: ReadySkill) {
    if (skill.folder === search.skill) return;
    void navigate({
      to: '/settings/$tab',
      params: { tab: 'skills' },
      search: { skill: skill.folder },
      replace: true,
      // Just saved, so nothing is lost.
      ignoreBlocker: true,
    });
  }

  const pluginFolder = skills.data?.pluginFolder ?? '';
  const shown = list === undefined ? undefined : openSkill(list, search);
  let editor: ReactNode = null;
  if (shown?.state === 'unreadable') {
    editor = (
      <UnreadableSkill
        key={shown.folder}
        folder={shown.folder}
        pluginFolder={pluginFolder}
        onDeleted={() => {
          deleted(shown.folder);
        }}
        className={editorColumn}
      />
    );
  } else if (shown !== undefined) {
    editor = (
      <SkillEditor
        // Each skill gets a form of its own, so nothing typed for one shows on another.
        key={shown?.folder ?? 'new'}
        skill={shown}
        pluginFolder={pluginFolder}
        onSaved={saved}
        onDeleted={() => {
          if (shown !== null) deleted(shown.folder);
        }}
        className={editorColumn}
      />
    );
  }

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
          <SkillEditorSkeleton className={editorColumn} />
        </div>
      ) : list.length === 0 && search.new !== true ? (
        <EmptyState
          title="No skills yet."
          action={
            <Button
              ref={startersButton}
              variant="secondary"
              size="sm"
              pending={starters.isPending}
              onClick={() => {
                starters.mutate();
              }}
            >
              <Icon icon={PlusSignIcon} aria-hidden />
              Add the starter skills
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          {list.length === 0 ? null : (
            <SkillList
              skills={list}
              current={openFolder(list, search)}
              onPick={open}
              itemRef={(folder, button) => {
                if (button === null) items.current.delete(folder);
                else items.current.set(folder, button);
              }}
              className={listColumn}
            />
          )}
          {editor}
        </div>
      )}
    </div>
  );
}
