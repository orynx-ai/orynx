import { Link } from '@tanstack/react-router';
import {
  cn,
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Picker,
} from '@devhub/ui';
import { useStatus } from '../../settings/queries.ts';
import { composerWords } from '../composer-words.ts';

const words = composerWords.agent;

/** Claude's dot: `success` when connected, `warning` when signed out (Q10). Its name says which, too. */
function Dot({ connected, className }: { connected: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full bg-current', connected ? 'text-success' : 'text-warning', className)}
    />
  );
}

/**
 * The composer's agent picker (`dh-picker`, spec 015, Q10): Claude, the only agent for now (010), and whether it's
 * signed in. Its menu has Claude checked with its state, and the way to Settings › Coding agent when signed out.
 */
export function AgentPicker() {
  const status = useStatus();
  if (status.data === undefined) return null;
  const { connected } = status.data.agent;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Picker icon={<Dot connected={connected} />} aria-label={words.label(connected)}>
          {words.name}
        </Picker>
      </MenuTrigger>
      <MenuContent aria-label={words.menu}>
        <MenuRadioGroup value="claude">
          <MenuRadioItem value="claude" description={connected ? words.connected : words.signedOut}>
            {words.name}
          </MenuRadioItem>
        </MenuRadioGroup>
        {connected ? null : (
          <>
            <MenuSeparator />
            <MenuItem asChild>
              <Link to="/settings/$tab" params={{ tab: 'coding-agent' }}>
                {words.settings}
              </Link>
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
