import { useId, type ComponentProps, type ReactElement } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { BrandMark } from './brand-mark.tsx';

/** A tool, or Orynx itself for a Claude session on neither a ticket nor a pull request (spec 015, Q15b). */
export type Source = 'jira' | 'github' | 'slack' | 'orynx';

const sourceNames: Record<Source, string> = { jira: 'Jira', github: 'GitHub', slack: 'Slack', orynx: 'Orynx' };

// The logo shapes come from Simple Icons (CC0), and Slack's four-colour mark from Slack's own 2019 logo.

/** Jira's mark: the top piece in light blue, the two below shaded from deep blue into it. */
function JiraLogo({ className }: { className: string }) {
  // Per mark, so two marks on one page never share a gradient. Each piece shades within its own box.
  const shade = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} focusable="false">
      <defs>
        <linearGradient id={shade} x1="0.98" y1="0.03" x2="0.4" y2="0.6">
          <stop offset="0.18" style={{ stopColor: 'var(--brand-jira-deep)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-jira)' }} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${shade})`}
        d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005z"
      />
      <path
        fill={`url(#${shade})`}
        d="M17.294 5.757H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001z"
      />
      <path
        className="fill-brand-jira"
        d="M23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"
      />
    </svg>
  );
}

/** GitHub's Invertocat, in the text colour: black on light, white on dark. */
function GitHubLogo({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} focusable="false">
      <path
        fill="currentColor"
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    </svg>
  );
}

/** Slack's mark in its four colours. */
function SlackLogo({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 122.8 122.8" className={className} focusable="false">
      <path
        className="fill-brand-slack-red"
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
      />
      <path
        className="fill-brand-slack-blue"
        d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
      />
      <path
        className="fill-brand-slack-green"
        d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
      />
      <path
        className="fill-brand-slack-yellow"
        d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
      />
    </svg>
  );
}

/** Orynx's own mark, in the text colour, fitted to the logo's square. */
function OrynxLogo({ className }: { className: string }) {
  return <BrandMark className={className} />;
}

const logos: Record<Source, (props: { className: string }) => ReactElement> = {
  jira: JiraLogo,
  github: GitHubLogo,
  slack: SlackLogo,
  orynx: OrynxLogo,
};

const markVariants = cva('inline-flex shrink-0 items-center justify-center', {
  variants: {
    source: {
      jira: '',
      github: 'text-github',
      slack: '',
      orynx: 'text-foreground',
    },
    // The large mark sits on a neutral tile, so every logo keeps its own colours in both themes.
    size: {
      default: 'size-5',
      lg: 'size-10 rounded-sm bg-subtle',
    },
  },
  defaultVariants: { size: 'default' },
});

const logoSizes = { default: 'size-4', lg: 'size-6' } as const;

export type SourceMarkProps = Omit<ComponentProps<'span'>, 'children'> &
  Omit<VariantProps<typeof markVariants>, 'source'> & {
    source: Source;
    /**
     * `hidden` keeps the name for screen readers only. `none` drops it, for rows that show the
     * name themselves right next to the mark (Settings › Connections).
     */
    label?: 'visible' | 'hidden' | 'none';
  };

/**
 * Design system: source mark (`dh-source`). Each tool's own logo in its own colours (the user's call,
 * 2026-10-17). The logo is decorative; the name is always there.
 */
export function SourceMark({ source, size, label = 'visible', className, ...props }: SourceMarkProps) {
  const Logo = logos[source];
  const logo = <Logo className={logoSizes[size ?? 'default']} />;
  if (label === 'none') {
    return (
      <span aria-hidden className={cn(markVariants({ source, size }), className)} {...props}>
        {logo}
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-small font-medium text-muted-foreground', className)}
      {...props}
    >
      <span aria-hidden className={markVariants({ source, size })}>
        {logo}
      </span>
      <span className={label === 'hidden' ? 'sr-only' : undefined}>{sourceNames[source]}</span>
    </span>
  );
}
