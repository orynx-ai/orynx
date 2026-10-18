import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { cn } from '../lib/cn.ts';

export type SplitterProps = Omit<ComponentProps<'div'>, 'defaultValue' | 'onChange'> & {
  /** What it resizes, for example "Resize sidebar". */
  'aria-label': string;
  /** The current size in px. */
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  /** px per arrow-key press. */
  step?: number;
  /** The size a double-click restores. */
  defaultValue?: number;
};

/**
 * A handle that resizes the panel before it (WAI-ARIA window splitter): drag it, or focus it
 * and use the arrow keys, Home and End. Invisible until hovered, focused or dragged, when an
 * accent line marks the edge. The caller positions it over the panel's edge.
 */
export function Splitter({
  value,
  min,
  max,
  onValueChange,
  step = 16,
  defaultValue,
  className,
  ...props
}: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, value });
  const clamp = (size: number) => Math.min(max, Math.max(min, Math.round(size)));

  const dragTo = useEffectEvent((clientX: number) => {
    onValueChange(clamp(dragStart.current.value + clientX - dragStart.current.x));
  });

  // While dragging, follow the pointer anywhere on the page, not only over the thin handle.
  useEffect(() => {
    if (!dragging) return;
    const move = (event: globalThis.PointerEvent) => {
      // No button held means the release happened where we could not see it (another window).
      if (event.buttons === 0) {
        setDragging(false);
        return;
      }
      dragTo(event.clientX);
    };
    const stop = () => {
      setDragging(false);
    };
    const { style } = document.documentElement;
    const previous = { cursor: style.cursor, userSelect: style.userSelect };
    style.cursor = 'col-resize';
    style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      style.cursor = previous.cursor;
      style.userSelect = previous.userSelect;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragStart.current = { x: event.clientX, value };
    setDragging(true);
  };

  // The window splitter keys. Up and Down stay with the page, and modified arrows stay with
  // the browser (⌘← and Alt+← are Back).
  const keys: Record<string, () => number> = {
    ArrowRight: () => value + step,
    ArrowLeft: () => value - step,
    Home: () => min,
    End: () => max,
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onValueChange(clamp(next()));
  };

  return (
    // A focusable separator is a widget in WAI-ARIA 1.2 (the window splitter pattern).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <div
      {...props}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${String(value)} pixels`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      data-dragging={dragging ? '' : undefined}
      // The ring sits inside the handle, so it closes even when the handle runs the page's full height.
      className={cn(
        'group flex w-3 cursor-col-resize touch-none justify-center focus-visible:-outline-offset-2',
        className,
      )}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        if (defaultValue !== undefined) onValueChange(clamp(defaultValue));
      }}
    >
      <span
        aria-hidden
        className="h-full w-0.5 group-hover:bg-info group-focus-visible:bg-info group-data-dragging:bg-info motion-safe:transition-colors"
      />
    </div>
  );
}
