import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { TerminalView, type TerminalScreen } from './terminal-view.tsx';

/** A terminal whose screen the test holds, as the session's output stream would, once xterm has loaded and drawn it. */
async function setUp({ takeFocus = false, screenReader }: { takeFocus?: boolean; screenReader?: boolean } = {}) {
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
  const feed = await vi.waitFor(() => {
    if (held === undefined) throw new Error('connect was never called');
    return held;
  });
  return { ...view, feed, stop, onData, onResize };
}

/** A row of the screen, matched whole: its colours split it into pieces. The screen reader's copy matches too. */
function row(text: string) {
  return (_: string, element: Element | null) =>
    element?.tagName === 'DIV' && element.textContent.replaceAll('\u00a0', ' ').trimEnd() === text;
}

describe('TerminalView', () => {
  it('AC-1 (038): is a terminal named for screen readers, drawing what it’s fed', async () => {
    const { container, feed } = await setUp();
    expect(screen.getByRole('group', { name: 'zsh · worktree' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'zsh · worktree' })).toBeInTheDocument();

    feed.write('\u001b[32m~/web-app\u001b[0m ❯ git status\r\nOn branch main');
    expect(await screen.findAllByText(row('On branch main'))).not.toHaveLength(0);
    expect(await screen.findAllByText(row('~/web-app ❯ git status'))).not.toHaveLength(0);
    await expectNoAxeViolations(container);
  });

  it('AC-5 (038): a replay draws from scratch, so what was there before goes', async () => {
    const { feed } = await setUp();
    feed.write('before');
    expect(await screen.findAllByText(row('before'))).not.toHaveLength(0);
    feed.reset('again');
    expect(await screen.findAllByText(row('again'))).not.toHaveLength(0);
    // The screen reader's copy of the rows catches up a moment after the screen.
    await waitFor(() => {
      expect(screen.queryAllByText(row('before'))).toHaveLength(0);
    });
  });

  it('keeps its rows as a list a screen reader reads, unless that’s turned off for speed (22 Oct 2026)', async () => {
    const on = await setUp();
    expect(screen.getByRole('list')).toBeInTheDocument();
    on.unmount();

    await setUp({ screenReader: false });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('AC-2 (038): sends what you type as a terminal does, Enter as a carriage return', async () => {
    const { onData } = await setUp({ takeFocus: true });
    const field = screen.getByRole('textbox', { name: 'zsh · worktree' });
    expect(field).toHaveFocus();
    await userEvent.setup().keyboard('ls{Enter}');
    expect(onData.mock.calls.join('')).toBe('ls\r');
  });

  it('AC-4 (038): says its size in characters once drawn', async () => {
    const { onResize } = await setUp();
    expect(onResize).toHaveBeenCalledWith({ cols: 80, rows: 24 });
  });

  it('stops being fed once it goes, and follows a renamed tab', async () => {
    const { stop, rerender } = await setUp();
    rerender(<TerminalView label="zsh 2" connect={() => stop} onData={() => undefined} onResize={() => undefined} />);
    expect(screen.getByRole('textbox', { name: 'zsh 2' })).toBeInTheDocument();
    expect(stop).not.toHaveBeenCalled();
    rerender(<p>gone</p>);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('never asks to be fed when it goes before xterm has loaded', async () => {
    const connect = vi.fn(() => () => undefined);
    const { unmount } = render(
      <TerminalView label="zsh" connect={connect} onData={() => undefined} onResize={() => undefined} />,
    );
    unmount();
    // A terminal opened after it has loaded xterm by the time it's drawn, so the first one's load has ended too.
    await setUp();
    expect(connect).not.toHaveBeenCalled();
  });
});
