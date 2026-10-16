import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceMark } from './source-mark.tsx';

describe('SourceMark', () => {
  it('always shows the source name next to the mark', () => {
    render(<SourceMark source="github" />);
    expect(screen.getByText('GitHub')).toBeVisible();
    expect(screen.getByText('G')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can keep the name for screen readers only', () => {
    render(<SourceMark source="slack" label="hidden" />);
    expect(screen.getByText('Slack')).toHaveClass('sr-only');
  });

  it('can drop the name when the row shows it next to the mark', () => {
    const { container } = render(<SourceMark source="jira" label="none" />);
    expect(screen.queryByText('Jira')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
