import { useState } from 'react';
import { GitPullRequestIcon, NoteEditIcon, Ticket01Icon } from '@hugeicons/core-free-icons';
import { Link, useNavigate } from '@tanstack/react-router';
import { Chip, Icon } from '@devhub/ui';
import { composerWords } from '../composer-words.ts';
import { StandupDialog } from './standup-dialog.tsx';

const words = composerWords.quickStarts;

/** The attention list's Pull requests tab: Radix names a trigger's id after its value. */
function focusPullRequestsTab() {
  document.querySelector<HTMLElement>('[role="tab"][id$="-trigger-pull-requests"]')?.focus();
}

/**
 * Home's quick starts (`dh-chip`, spec 015, Q12): Pick up a ticket opens Tickets, and Review a pull request turns
 * the list below to its Pull requests tab, and Write my standup drafts yours (spec 057, C). Fix failing checks and
 * Draft a Slack reply wait for their own specs.
 */
export function QuickStarts() {
  const navigate = useNavigate();
  const [standup, setStandup] = useState(false);
  return (
    <div role="group" aria-label={words.label} className="flex flex-wrap justify-center gap-2">
      <Chip asChild>
        <Link to="/tickets">
          <Icon icon={Ticket01Icon} aria-hidden />
          {words.ticket}
        </Link>
      </Chip>
      <Chip
        onClick={() => {
          void navigate({ to: '/', search: { inbox: 'pull-requests' }, resetScroll: false }).then(() => {
            requestAnimationFrame(focusPullRequestsTab);
          });
        }}
      >
        <Icon icon={GitPullRequestIcon} aria-hidden />
        {words.review}
      </Chip>
      <Chip
        onClick={() => {
          setStandup(true);
        }}
      >
        <Icon icon={NoteEditIcon} aria-hidden />
        {words.standup}
      </Chip>
      <StandupDialog
        open={standup}
        onClose={() => {
          setStandup(false);
        }}
      />
    </div>
  );
}
