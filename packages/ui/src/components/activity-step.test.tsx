import { render, screen, within } from '@testing-library/react';
import { FileSearchIcon, PencilEdit01Icon, TerminalIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ActivityList, ActivityStep } from './activity-step.tsx';
import { Icon } from './icon.tsx';

describe('ActivityStep', () => {
  it("AC-25: lists Claude's steps with their title and detail, in a polite live region", async () => {
    const { container } = render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep
          state="done"
          icon={<Icon icon={FileSearchIcon} />}
          title="Read 6 files"
          detail="ContentList.tsx and 5 more"
        />
        <ActivityStep state="done" icon={<Icon icon={PencilEdit01Icon} />} title="Edited 4 files" detail="+142 −18" />
        <ActivityStep
          state="waiting"
          icon={<Icon icon={TerminalIcon} />}
          title="Wants to run npm test"
          detail="Waiting for you"
        />
        <ActivityStep icon={<Icon icon={TerminalIcon} />} title="Run the linter" />
      </ActivityList>,
    );

    const list = screen.getByRole('list', { name: "Claude's progress" });
    expect(list).toHaveAttribute('aria-live', 'polite');
    const steps = within(list).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Read 6 files, doneContentList.tsx and 5 more',
      'Edited 4 files, done+142 −18',
      'Wants to run npm test, needs youWaiting for you',
      'Run the linter',
    ]);
    // The state is in words for screen readers, not only in the dot's colour.
    expect(within(steps[0] ?? list).getByText(', done')).toHaveClass('sr-only');
    expect(within(list).getByText(', needs you')).toHaveClass('sr-only');
    // The dots and their icons are for the eye only.
    expect(within(list).queryByRole('img')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
