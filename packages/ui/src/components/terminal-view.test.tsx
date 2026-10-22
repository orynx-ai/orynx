import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { TerminalView, type TerminalScreen } from './terminal-view.tsx';

/** A terminal whose screen the test holds, as the session's output stream would. */
function setUp({ takeFocus = false, screenReader }: { takeFocus?: boolean; screenReader?: boolean } = {}) {
  let held: TerminalScreen | undefined;
  const stop = vi.fn();
  const onData = vi.fn();
  const onResize = vi.fn();
  const view = render(
    <TerminalView
      label="zsh · worktree"
      takeFocus={takeFocus}
      {...(screenReader === undefined ? {} : { screenReader })}
      connect={(given) => {
        held = given;
        return stop;
      }}
      onData={onData}
      onResize={onResize}
    />,
  );
  if (held === undefined) throw new Error('connect was never called');
  return { ...view, feed: held, stop, onData, onResize };
}

/** A row of the screen, matched whole: its colours split it into pieces. The screen reader's copy matches too. */
function row(text: string) {
  return (_: string, element: Element | null) =>
    element?.tagName === 'DIV' && element.textContent.replaceAll('\u00a0', ' ').trimEnd() === text;
}

describe('TerminalView', () => {
  it('AC-1 (038): is a terminal named for screen readers, drawing what it’s fed', async () => {
    const { container, feed } = setUp();
    expect(screen.getByRole('group', { name: 'zsh · worktree' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'zsh · worktree' })).toBeInTheDocument();

    feed.write('\u001b[32m~/web-app\u001b[0m ❯ git status\r\nOn branch main');
    expect(await screen.findAllByText(row('On branch main'))).not.toHaveLength(0);
    expect(await screen.findAllByText(row('~/web-app ❯ git status'))).not.toHaveLength(0);
    await expectNoAxeViolations(container);
  });

  it('AC-5 (038): a replay draws from scratch, so what was there before goes', async () => {
    const { feed } = setUp();
    feed.write('before');
    expect(await screen.findAllByText(row('before'))).not.toHaveLength(0);
    feed.reset('again');
    expect(await screen.findAllByText(row('again'))).not.toHaveLength(0);
    expect(screen.queryAllByText(row('before'))).toHaveLength(0);
  });

  it('keeps its rows as a list a screen reader reads, unless that’s turned off for speed (22 Oct 2026)', () => {
    const on = setUp();
    expect(screen.getByRole('list')).toBeInTheDocument();
    on.unmount();

    setUp({ screenReader: false });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('AC-2 (038): sends what you type as a terminal does, Enter as a carriage return', async () => {
    const { onData } = setUp({ takeFocus: true });
    const field = screen.getByRole('textbox', { name: 'zsh · worktree' });
    expect(field).toHaveFocus();
    await userEvent.setup().keyboard('ls{Enter}');
    expect(onData.mock.calls.join('')).toBe('ls\r');
  });

  it('AC-4 (038): says its size in characters once drawn', () => {
    const { onResize } = setUp();
    expect(onResize).toHaveBeenCalledWith({ cols: 80, rows: 24 });
  });

  it('stops being fed once it goes, and follows a renamed tab', () => {
    const { stop, rerender } = setUp();
    rerender(<TerminalView label="zsh 2" connect={() => stop} onData={() => undefined} onResize={() => undefined} />);
    expect(screen.getByRole('textbox', { name: 'zsh 2' })).toBeInTheDocument();
    expect(stop).not.toHaveBeenCalled();
    rerender(<p>gone</p>);
    expect(stop).toHaveBeenCalledOnce();
  });
});
