import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SourceMark } from './source-mark.tsx';

/** The logo's svg inside a rendered mark. */
function logo(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('No logo drawn.');
  return svg;
}

describe('SourceMark', () => {
  it('always shows the source name next to the logo, which screen readers skip', () => {
    const { container } = render(<SourceMark source="github" />);

    expect(screen.getByText('GitHub')).toBeVisible();
    expect(logo(container).closest('[aria-hidden="true"]')).not.toBeNull();
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

  it("draws Slack's logo in its four brand colours", () => {
    const { container } = render(<SourceMark source="slack" label="none" />);

    const fills = [...logo(container).querySelectorAll('path')].map((path) => path.getAttribute('class'));
    expect(fills).toEqual([
      'fill-brand-slack-red',
      'fill-brand-slack-blue',
      'fill-brand-slack-green',
      'fill-brand-slack-yellow',
    ]);
  });

  it("draws Jira's logo in its brand blues, with gradients of its own on every mark", () => {
    const { container } = render(
      <>
        <SourceMark source="jira" label="none" />
        <SourceMark source="jira" label="none" />
      </>,
    );

    const [first, second] = [...container.querySelectorAll('svg')].map((svg) => {
      const gradient = svg.querySelector('linearGradient');
      if (gradient === null) throw new Error('No gradient drawn.');
      return { svg, gradient };
    });
    if (first === undefined || second === undefined) throw new Error('Two marks expected.');
    expect(first.gradient.id).not.toBe(second.gradient.id);
    expect([...first.gradient.querySelectorAll('stop')].map((stop) => stop.style.stopColor)).toEqual([
      'var(--brand-jira-deep)',
      'var(--brand-jira)',
    ]);
    const fills = [...first.svg.querySelectorAll('path')].map(
      (path) => path.getAttribute('fill') ?? path.getAttribute('class'),
    );
    expect(fills).toEqual([`url(#${first.gradient.id})`, `url(#${first.gradient.id})`, 'fill-brand-jira']);
  });

  it("draws GitHub's logo in the text colour, black on light and white on dark", () => {
    const { container } = render(<SourceMark source="github" label="none" />);

    expect(logo(container).querySelector('path')).toHaveAttribute('fill', 'currentColor');
    expect(container.firstElementChild).toHaveClass('text-github');
  });

  it("AC-24 (spec 015, Q15b): draws Orynx's own mark, in the text colour, for a session with no ticket", () => {
    const { container } = render(<SourceMark source="orynx" label="hidden" />);

    expect(screen.getByText('Orynx')).toHaveClass('sr-only');
    expect(logo(container)).toHaveAttribute('fill', 'currentColor');
    expect(logo(container)).toHaveClass('size-4');
    expect(logo(container).parentElement).toHaveClass('text-foreground', 'size-5');
  });

  it('AC-2 (spec 023): marks one of your skills with an S on the info wash, named Skill, at either size', () => {
    const { container, rerender } = render(<SourceMark source="skill" />);
    expect(screen.getByText('Skill')).toBeVisible();
    const tile = screen.getByText('S').closest('[aria-hidden="true"]');
    expect(tile).toHaveClass('bg-info-subtle', 'text-info-foreground');

    rerender(<SourceMark source="skill" size="lg" label="none" />);
    // The large mark's neutral tile gives way to the skill's own wash.
    expect(container.firstElementChild).toHaveClass('size-10', 'bg-info-subtle');
    expect(container.firstElementChild).not.toHaveClass('bg-subtle');
  });

  it('has no accessibility violations at either size, with or without the name', async () => {
    const { container } = render(
      <>
        <SourceMark source="jira" />
        <SourceMark source="github" size="lg" label="hidden" />
        <SourceMark source="slack" size="lg" label="none" />
        <SourceMark source="orynx" label="hidden" />
      </>,
    );

    await expectNoAxeViolations(container);
  });
});
