import type { ComponentProps } from 'react';
import { Check } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

type StepState = 'done' | 'current' | 'todo';

const markVariants = cva(
  'inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-label font-medium',
  {
    variants: {
      state: {
        done: 'border-transparent bg-success-subtle text-success',
        current: 'border-primary bg-primary text-primary-foreground',
        todo: 'border-control text-muted-foreground',
      },
    },
  },
);

export type StepperProps = Omit<ComponentProps<'ol'>, 'children'> & {
  /** What the steps are the progress of, for example "Session progress". */
  'aria-label': string;
  /** The steps' names, in order. Five at most. */
  steps: readonly string[];
  /** The index of the current step. Steps before it are done; past the last step, all are done. */
  current: number;
};

/**
 * Design system: Stepper (`dh-stepper`). Where an agent session is: Plan, Build, Test, Review, Pull
 * request. Done steps show a check and say ", done" to screen readers; the current step is the only
 * filled circle and has `aria-current="step"`. It sits under the page title, never inside a card,
 * and wraps onto a second line when it has to.
 */
export function Stepper({ steps, current, className, ...props }: StepperProps) {
  return (
    <ol className={cn('m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-small', className)} {...props}>
      {steps.map((label, index) => {
        const state: StepState = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5',
              state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {index > 0 ? <span aria-hidden className="me-0.5 h-px w-5 bg-control" /> : null}
            <span data-slot="stepper-mark" aria-hidden className={markVariants({ state })}>
              {state === 'done' ? <Check className="size-3.5 stroke-2" /> : index + 1}
            </span>
            {label}
            {state === 'done' ? <span className="sr-only">, done</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
