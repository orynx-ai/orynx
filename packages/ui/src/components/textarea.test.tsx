import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Field } from './field.tsx';
import { Textarea } from './textarea.tsx';

describe('Textarea (spec 014, Q10b)', () => {
  it('is a real multi-line text box: Enter adds a line, as a description needs', async () => {
    render(<Textarea aria-label="Description" />);
    const box = screen.getByRole('textbox', { name: 'Description' });

    await userEvent.type(box, 'What changed{Enter}How it was checked');

    expect(box).toHaveValue('What changed\nHow it was checked');
  });

  it('shows 10 lines before it scrolls inside, and can be made taller or shorter', () => {
    render(<Textarea aria-label="Description" />);
    const box = screen.getByRole('textbox', { name: 'Description' });
    expect(box).toHaveAttribute('rows', '10');
    expect(box).toHaveClass('resize-y');
  });

  it('takes its label, its help and its error from the field around it', () => {
    const { rerender } = render(
      <Field label="Description" help="Markdown, as on GitHub.">
        <Textarea />
      </Field>,
    );
    const box = screen.getByRole('textbox', { name: 'Description' });
    expect(box).toHaveAccessibleDescription('Markdown, as on GitHub.');
    expect(box).not.toHaveAttribute('aria-invalid');

    rerender(
      <Field label="Description" error="Keep the description under 65,536 characters.">
        <Textarea />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveAccessibleDescription(
      'Keep the description under 65,536 characters.',
    );
  });

  it('takes no typing when disabled or read-only, and keeps what it holds', async () => {
    render(
      <>
        <Textarea aria-label="Off" disabled defaultValue="Kept" />
        <Textarea aria-label="Creating" readOnly defaultValue="Kept too" />
      </>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Off' }), 'x');
    await userEvent.type(screen.getByRole('textbox', { name: 'Creating' }), 'x');
    expect(screen.getByRole('textbox', { name: 'Off' })).toHaveValue('Kept');
    expect(screen.getByRole('textbox', { name: 'Creating' })).toHaveValue('Kept too');
  });

  it('AC-2 (spec 023): can draw text Claude reads as written, in the mono face, at least 300 px tall, unchecked for spelling', () => {
    render(<Textarea aria-label="Instructions for Claude" mono />);
    const box = screen.getByRole('textbox', { name: 'Instructions for Claude' });
    expect(box).toHaveClass('font-mono', 'text-code', 'min-h-75', 'resize-y');
    expect(box).not.toHaveClass('text-body');
    expect(box).toHaveAttribute('spellcheck', 'false');
  });

  it('has no accessibility violations in a field', async () => {
    const { container } = render(
      <Field label="Description" help="Markdown, as on GitHub.">
        <Textarea defaultValue="What changed" />
      </Field>,
    );
    await expectNoAxeViolations(container);
  });
});
