import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

export type Source = 'jira' | 'github' | 'slack';

const sourceNames: Record<Source, string> = { jira: 'Jira', github: 'GitHub', slack: 'Slack' };
const sourceGlyphs: Record<Source, string> = { jira: 'J', github: 'G', slack: '#' };

const markVariants = cva('inline-flex shrink-0 items-center justify-center font-medium', {
  variants: {
    source: {
      jira: 'bg-info-subtle text-jira',
      github: 'bg-subtle text-github',
      slack: 'bg-slack-subtle text-slack',
    },
    size: {
      default: 'size-5 rounded-xs text-label',
      lg: 'size-10 rounded-sm text-body',
    },
  },
  defaultVariants: { size: 'default' },
});

export type SourceMarkProps = Omit<ComponentProps<'span'>, 'children'> &
  Omit<VariantProps<typeof markVariants>, 'source'> & {
    source: Source;
    /**
     * `hidden` keeps the name for screen readers only. `none` drops it, for rows that show the
     * name themselves right next to the mark (Settings › Connections).
     */
    label?: 'visible' | 'hidden' | 'none';
  };

/** Design system: source mark (`dh-source`). The mark is decorative; the name is always there. */
export function SourceMark({ source, size, label = 'visible', className, ...props }: SourceMarkProps) {
  if (label === 'none') {
    return (
      <span aria-hidden className={cn(markVariants({ source, size }), className)} {...props}>
        {sourceGlyphs[source]}
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-small font-medium text-muted-foreground', className)}
      {...props}
    >
      <span aria-hidden className={markVariants({ source, size })}>
        {sourceGlyphs[source]}
      </span>
      <span className={label === 'hidden' ? 'sr-only' : undefined}>{sourceNames[source]}</span>
    </span>
  );
}
