import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

export type SliderProps = Omit<ComponentProps<'input'>, 'type'>;

/**
 * Design system: `dh-range` (spec 029, Settings › Notifications' Volume). A native range input, so arrows, Page Up
 * and Down, Home and End work as the computer does; the browser draws it in the ink. Name it with a `<label>`, and
 * give `aria-valuetext` when the number alone isn't what to hear ("35%").
 */
export function Slider({ className, ...props }: SliderProps) {
  return (
    <input
      type="range"
      className={cn('w-full cursor-pointer accent-info disabled:cursor-not-allowed disabled:opacity-45', className)}
      {...props}
    />
  );
}
