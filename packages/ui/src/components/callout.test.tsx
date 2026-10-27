import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FakeResizeObserver } from '../test/fake-resize-observer.ts';
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

  it('AC-13 (spec 020): a closable notice ends in a close button named by its label, with its tooltip', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Callout title="Everything stays on this computer" closeLabel="Hide this note" onClose={onClose}>
        Tokens live in your OS keychain.
      </Callout>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Hide this note' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hide this note');
    await expectNoAxeViolations(container);
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('spec 048: with its buttons at the end, reads its words first, then its buttons, with no accessibility violations', async () => {
    const { container } = render(
      <Callout
        tone="warning"
        role="status"
        title="Ready to push"
        actionsAt="end"
        actions={<Button size="sm">Push to PR #2974</Button>}
      >
        <span>2 files, +91 −29.</span>
      </Callout>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^Ready to push2 files, \+91 −29\.Push to PR #2974$/);
    expect(screen.getByRole('button', { name: 'Push to PR #2974' })).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('has no close button unless asked for one', () => {
    render(<Callout title="Claude wants to run a command">npm test</Callout>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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

  it('spec 030: says something went well in the success tone, with no accessibility violations', async () => {
    const { container } = render(<Callout tone="success" title="Jira connected. Your inbox is refreshing." />);
    expect(screen.getByText('Jira connected. Your inbox is refreshing.')).toBeVisible();
    await expectNoAxeViolations(container);
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

  it('012 AC-19: a command that starts to scroll when the window narrows can then be reached by keyboard', () => {
    render(<CalloutCode>{'npm test -- content-list '.repeat(20)}</CalloutCode>);
    const code = screen.getByText(/npm test/);
    const box = code.closest('pre');
    if (box === null) throw new Error('no box');
    expect(box).not.toHaveAttribute('tabindex');

    // The same text, wrapped onto more lines than the box holds: at its full height only the text grows.
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 352 });
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 252 });
    act(() => {
      FakeResizeObserver.resize(code);
    });
    expect(box).toHaveAttribute('tabindex', '0');

    // Wide again: it fits, so it leaves the Tab order.
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 112 });
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 112 });
    act(() => {
      FakeResizeObserver.resize(box);
    });
    expect(box).not.toHaveAttribute('tabindex');
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
