import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Callout, CalloutCode } from './callout.tsx';

describe('Callout', () => {
  it('announces an approval when given role="alert"', () => {
    render(
      <Callout tone="warning" role="alert" title="Claude wants to run a command" actions={<Button>Allow once</Button>}>
        <code>npm test</code>
      </Callout>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Claude wants to run a command');
    expect(alert).toHaveTextContent('npm test');
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeVisible();
  });

  it('shows an info notice with its body', () => {
    render(<Callout title="Everything stays on this computer">Tokens live in your OS keychain.</Callout>);
    expect(screen.getByText('Everything stays on this computer')).toBeVisible();
    expect(screen.getByText('Tokens live in your OS keychain.')).toBeVisible();
  });

  it('AC-13 (spec 011): says what went wrong in the danger tone, title first', () => {
    render(
      <Callout tone="danger" title="Claude couldn't start">
        Claude Code&apos;s login didn&apos;t work.
      </Callout>,
    );
    expect(screen.getByText("Claude couldn't start")).toBeVisible();
    expect(screen.getByText("Claude Code's login didn't work.")).toBeVisible();
  });

  it('has no accessibility violations in the danger tone', async () => {
    const { container } = render(
      <Callout tone="danger" title="Claude couldn't start">
        See the terminal for details.
      </Callout>,
    );
    await expectNoAxeViolations(container);
  });

  it('012 AC-1, Q8a: shows the exact command as code, with its spacing and line breaks kept', () => {
    render(
      <Callout tone="warning" role="alert" title="Claude wants to run a command">
        <CalloutCode>{'npm test --  content-list\nnpm run lint'}</CalloutCode>
      </Callout>,
    );
    const code = screen.getByText(/npm test --/);
    expect(code.tagName).toBe('CODE');
    expect(code.textContent).toBe('npm test --  content-list\nnpm run lint');
    expect(code.closest('pre')).not.toBeNull();
  });

  it('012 AC-19: a command too long to show whole can be reached by keyboard to scroll it', () => {
    const { rerender } = render(<CalloutCode>npm test</CalloutCode>);
    const box = screen.getByText('npm test').closest('pre');
    expect(box).not.toHaveAttribute('tabindex');

    // jsdom lays nothing out, so the box says how tall its content is, as a browser would.
    if (box !== null) {
      Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 600 });
      Object.defineProperty(box, 'clientHeight', { configurable: true, value: 252 });
    }
    rerender(<CalloutCode>{'npm test\n'.repeat(30)}</CalloutCode>);
    expect(box).toHaveAttribute('tabindex', '0');
  });

  it('has no accessibility violations with a command', async () => {
    const { container } = render(
      <Callout tone="warning" role="alert" title="Claude wants to run a command">
        <CalloutCode>npm test -- content-list</CalloutCode>
      </Callout>,
    );
    await expectNoAxeViolations(container);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Callout title="Notice">Body</Callout>);
    await expectNoAxeViolations(container);
  });
});
