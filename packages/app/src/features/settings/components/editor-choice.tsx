import { useId } from 'react';
import { SourceCodeIcon } from '@hugeicons/core-free-icons';
import type { Editor } from '@devhub/contracts';
import { ChoiceCard } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { SaveError } from './save-error.tsx';
import { SectionHeading } from './section-heading.tsx';

/** The editors Open in can use, VS Code first and by default (spec 013, Q9). */
const editors: readonly { value: Editor; title: string }[] = [
  { value: 'vscode', title: 'VS Code' },
  { value: 'cursor', title: 'Cursor' },
];

/**
 * Settings › Coding agent's Open changes in (spec 013, Q9): where the Session screen's Open in opens a session's
 * worktree. Built like Appearance: choice cards, saved as you pick, shown at once, and taken back with the save
 * error if the save fails. Side by side as the redesign draws them (19 Oct 2026).
 */
export function EditorChoice() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const headingId = useId();
  // While loading, the same choices with none picked, so nothing moves when the answer comes.
  const picked = preferences.data?.editor;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
      <SectionHeading
        id={headingId}
        icon={SourceCodeIcon}
        title="Open changes in"
        line="Used by Open in editor on a session."
      />
      <div role="radiogroup" aria-labelledby={headingId} className="grid gap-2.5 @lg:grid-cols-2">
        {editors.map((editor) => (
          <ChoiceCard
            key={editor.value}
            name="editor"
            value={editor.value}
            title={editor.title}
            checked={picked === editor.value}
            disabled={picked === undefined}
            onChange={() => {
              change.mutate({ editor: editor.value });
            }}
          />
        ))}
      </div>
      {change.isError ? <SaveError /> : null}
    </section>
  );
}
