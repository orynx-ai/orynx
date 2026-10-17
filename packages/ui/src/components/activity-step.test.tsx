import { render, screen, within } from '@testing-library/react';
import { FileSearch, Pencil, Terminal } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ActivityList, ActivityStep } from './activity-step.tsx';

describe('ActivityStep', () => {
  it("AC-25: lists Claude's steps with their title and detail, in a polite live region", async () => {
    const { container } = render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep state="done" icon={<FileSearch />} title="Read 6 files" detail="ContentList.tsx and 5 more" />
        <ActivityStep state="done" icon={<Pencil />} title="Edited 4 files" detail="+142 −18" />
        <ActivityStep state="waiting" icon={<Terminal />} title="Wants to run npm test" detail="Waiting for you" />
        <ActivityStep icon={<Terminal />} title="Run the linter" />
      </ActivityList>,
    );

    const list = screen.getByRole('list', { name: "Claude's progress" });
    expect(list).toHaveAttribute('aria-live', 'polite');
    const steps = within(list).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Read 6 filesContentList.tsx and 5 more',
      'Edited 4 files+142 −18',
      'Wants to run npm testWaiting for you',
      'Run the linter',
    ]);
    expect(steps.map((step) => step.dataset['state'])).toEqual(['done', 'done', 'waiting', 'plain']);
    // The dots and their icons are for the eye only.
    expect(within(list).queryByRole('img')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
