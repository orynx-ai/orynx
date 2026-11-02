import { useId, type ComponentProps, type ReactElement } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { BrandMark } from './brand-mark.tsx';

/**
 * A tool, Orynx itself for a Claude session on neither a ticket nor a pull request (spec 015, Q15b), or one of your
 * skills (spec 023).
 */
export type Source = 'jira' | 'github' | 'slack' | 'discord' | 'orynx' | 'skill';

const sourceNames: Record<Source, string> = {
  jira: 'Jira',
  github: 'GitHub',
  slack: 'Slack',
  discord: 'Discord',
  orynx: 'Orynx',
  skill: 'Skill',
};

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

/** Discord's mark in its blurple (spec 016, Q5). */
function DiscordLogo({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} focusable="false">
      <path
        className="fill-brand-discord"
        d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
      />
    </svg>
  );
}

/** Orynx's own mark, in the text colour, fitted to the logo's square. */
function OrynxLogo({ className }: { className: string }) {
  return <BrandMark className={className} />;
}

/** A skill has no logo: the design's `dh-source--skill` draws an S. */
function SkillLetter({ className }: { className: string }) {
  return <span className={cn('inline-flex items-center justify-center font-medium', className)}>S</span>;
}

const logos: Record<Source, (props: { className: string }) => ReactElement> = {
  jira: JiraLogo,
  github: GitHubLogo,
  slack: SlackLogo,
  discord: DiscordLogo,
  orynx: OrynxLogo,
  skill: SkillLetter,
};

const markVariants = cva('inline-flex shrink-0 items-center justify-center', {
  variants: {
    source: {
      jira: '',
      github: 'text-github',
      slack: '',
      discord: '',
      orynx: 'text-foreground',
      skill: 'rounded-xs bg-info-subtle text-info-foreground',
    },
    // The large mark sits on a neutral tile, so every logo keeps its own colours in both themes.
    size: {
      default: 'size-5',
      lg: 'size-10 rounded-sm bg-subtle',
    },
  },
  // The skill's own wash wins over the large mark's neutral tile.
  compoundVariants: [{ source: 'skill', size: 'lg', className: 'rounded-sm bg-info-subtle' }],
  defaultVariants: { size: 'default' },
});

const logoSizes = { default: 'size-4', lg: 'size-6' } as const;
/** The S's size, for a skill: as a pill's label in the small mark, as body text in the large one. */
const letterSizes = { default: 'text-label', lg: 'text-body' } as const;

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
  const logo = (
    <Logo className={cn(logoSizes[size ?? 'default'], source === 'skill' && letterSizes[size ?? 'default'])} />
  );
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
      <span aria-hidden className={cn(markVariants({ source, size }))}>
        {logo}
      </span>
      <span className={label === 'hidden' ? 'sr-only' : undefined}>{sourceNames[source]}</span>
    </span>
  );
}
