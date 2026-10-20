import { useEffect, useEffectEvent, useRef, type ComponentProps } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import { cn } from '../lib/cn.ts';

/** What feeds a {@link TerminalView} draws with. */
export interface TerminalScreen {
  /** Draws what the shell wrote, colours, cursor moves and all. */
  write(data: string): void;
  /** Clears the screen and its scrollback, then draws `data`: everything kept, drawn again. */
  reset(data: string): void;
}

export interface TerminalViewSize {
  cols: number;
  rows: number;
}

export type TerminalViewProps = Omit<ComponentProps<'div'>, 'children' | 'onResize'> & {
  /** The terminal's name, for screen readers: the tab's, "zsh · worktree". */
  label: string;
  /** Hands the screen to whatever feeds it output, once it's drawn; returns how to stop feeding it. */
  connect: (screen: TerminalScreen) => () => void;
  /** Keys you pressed and text you pasted, as a terminal sends them: "\r" for Enter, "\u0003" for ⌃C. */
  onData: (data: string) => void;
  /** Its size in characters, once it's drawn and whenever its box changes. */
  onResize: (size: TerminalViewSize) => void;
  /** Takes focus once it's drawn. */
  takeFocus?: boolean;
};

/**
 * The theme's tokens where the terminal is drawn, so it follows light and dark: the raised surface and the text
 * colour, with danger, success and warning for red, green and yellow. The other colours are xterm's own, kept
 * readable by its minimum contrast.
 */
function themeOf(element: HTMLElement): ITheme {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const background = token('--bg-raised');
  const text = token('--text-primary');
  const danger = token('--danger');
  const success = token('--success');
  const warning = token('--warning');
  return {
    background,
    foreground: text,
    cursor: text,
    cursorAccent: background,
    selectionBackground: token('--accent-subtle'),
    red: danger,
    brightRed: danger,
    green: success,
    brightGreen: success,
    yellow: warning,
    brightYellow: warning,
  };
}

/**
 * A real terminal (spec 038), drawn by xterm.js: what `connect` feeds it shows as a terminal would, colours and
 * full-screen programs included, and what you type comes out of `onData`. It fills its box and says its size in
 * characters whenever that changes. Its rows are also a list a screen reader can read. A key something else has
 * already handled (a shortcut caught on the window) never reaches it.
 */
export function TerminalView({ label, connect, onData, onResize, takeFocus, className, ...props }: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const feed = useEffectEvent(connect);
  const typed = useEffectEvent(onData);
  const sized = useEffectEvent(onResize);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = Number.parseFloat(style.lineHeight) / fontSize;
    const term = new Terminal({
      cursorBlink: true,
      screenReaderMode: true,
      scrollback: 5_000,
      minimumContrastRatio: 4.5,
      theme: themeOf(element),
      // The type scale's code size and the mono font, from the box's own classes; xterm's defaults without them.
      ...(style.fontFamily === '' ? {} : { fontFamily: style.fontFamily }),
      ...(Number.isFinite(fontSize) ? { fontSize } : {}),
      ...(Number.isFinite(lineHeight) ? { lineHeight } : {}),
    });
    terminal.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.attachCustomKeyEventHandler((event) => !event.defaultPrevented);
    term.open(element);
    const listening = [
      term.onData((data) => {
        typed(data);
      }),
      term.onResize(({ cols, rows }) => {
        sized({ cols, rows });
      }),
    ];
    fit.fit();
    sized({ cols: term.cols, rows: term.rows });

    const box = new ResizeObserver(() => {
      fit.fit();
    });
    box.observe(element);
    const retheme = () => {
      term.options.theme = themeOf(element);
    };
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', retheme);
    const picked = new MutationObserver(retheme);
    picked.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const stop = feed({
      write: (data) => {
        term.write(data);
      },
      reset: (data) => {
        term.reset();
        term.write(data);
      },
    });
    return () => {
      stop();
      picked.disconnect();
      scheme.removeEventListener('change', retheme);
      box.disconnect();
      for (const one of listening) one.dispose();
      terminal.current = null;
      term.dispose();
    };
  }, []);

  useEffect(() => {
    terminal.current?.textarea?.setAttribute('aria-label', label);
  }, [label]);

  useEffect(() => {
    if (takeFocus) terminal.current?.focus();
  }, [takeFocus]);

  // xterm fits the box it's drawn in, padding and all, so the padding sits on a box around it.
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex min-h-0 flex-col bg-raised px-3.5 py-2', className)}
      {...props}
    >
      <div ref={host} className="min-h-0 flex-1 font-mono text-code" />
    </div>
  );
}
