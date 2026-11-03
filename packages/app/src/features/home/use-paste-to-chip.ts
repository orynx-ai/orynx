import type { ClipboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { threadFromLink, type ComposerChip, type ThreadPreviewAnswer } from '@devhub/contracts';
import { useApi } from '../../api.tsx';
import { chipFromPaste, type ChipRefusal } from './composer-rules.ts';
import { refusedLine } from './composer-words.ts';

/**
 * A paste that names one thing becomes its chip (spec 015, Q6): a Jira key or a pull request link at once, and a
 * Slack or Discord message link once the server has read who started its thread and where (spec 016, AC-26).
 * Anything else is pasted as text. `say` shows why nothing was added, or null to clear it.
 */
export function usePasteToChip(
  addChip: (chip: ComposerChip) => ChipRefusal | null,
  say: (line: string | null) => void,
): (event: ClipboardEvent<HTMLTextAreaElement>) => void {
  const api = useApi();
  const preview = useMutation<ThreadPreviewAnswer, Error, string>({ mutationFn: (link) => api.threadPreview(link) });

  function added(chip: ComposerChip) {
    const refusal = addChip(chip);
    say(refusal === null ? null : refusedLine(refusal));
  }

  return (event) => {
    const text = event.clipboardData.getData('text/plain');
    const chip = chipFromPaste(text);
    if (chip !== null) {
      event.preventDefault();
      added(chip);
      return;
    }
    const thread = threadFromLink(text);
    if (thread === null) return;
    event.preventDefault();
    const tool = thread.kind === 'slack_thread' ? 'Slack' : 'Discord';
    const gone = `${tool} can't find that thread, or Orynx can't read it.`;
    preview.mutate(text, {
      onSuccess: (answer) => {
        if (answer.result === 'found') added({ ...answer.chip, label: answer.label });
        else say(answer.result === 'not_connected' ? `Connect ${tool} in Settings to add its threads.` : gone);
      },
      onError: () => {
        say(gone);
      },
    });
  };
}
