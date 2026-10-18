import type { Editor } from '@devhub/contracts';
import { ChoiceCard, ChoiceGroup } from '@devhub/ui';
import { useChangePreferences, usePreferences } from '../queries.ts';
import { SaveError } from './save-error.tsx';

/** The editors Open in can use, VS Code first and by default (spec 013, Q9). */
const editors: readonly { value: Editor; title: string }[] = [
  { value: 'vscode', title: 'VS Code' },
  { value: 'cursor', title: 'Cursor' },
];

/**
 * Settings › Coding agent's Editor (spec 013, Q9): where the Session screen's Open in opens a session's
 * worktree. Built like Appearance: two choice cards, saved as you pick, shown at once, and taken back with the
 * save error if the save fails.
 */
export function EditorChoice() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  // While loading, the same choices with none picked, so nothing moves when the answer comes.
  const picked = preferences.data?.editor;
  return (
    <div className="flex flex-col gap-2">
      <ChoiceGroup legend="Editor">
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
      </ChoiceGroup>
      {change.isError ? <SaveError /> : null}
    </div>
  );
}
