import { useId, useState } from 'react';
import {
  defaultNotificationSettings,
  type NotificationSettings,
  type NotificationSettingsChange,
} from '@devhub/contracts';
import { Button, Checkbox, Pill, SettingList, SettingRow, Switch } from '@devhub/ui';
import { askDesktopPermission, desktopPermission, type DesktopPermission } from '../../notifications/desktop.ts';
import { useChangeNotificationSettings, useNotificationSettings } from '../../notifications/queries.ts';
import { usePlatform } from '../../../platform.tsx';
import { SaveError } from './save-error.tsx';
import { ServerUnreachable } from './server-unreachable.tsx';

const permissionPills: Record<DesktopPermission, { tone: 'success' | 'warning'; text: string }> = {
  granted: { tone: 'success', text: 'Allowed in this browser' },
  default: { tone: 'warning', text: 'Not allowed yet' },
  denied: { tone: 'warning', text: 'Blocked in browser settings' },
};

/**
 * Settings › Notifications (spec 029): where you're told, the sounds, what about, and when to be left alone. Saved
 * as you change it. While it loads, the same controls show the defaults, disabled, so nothing moves when it comes.
 */
export function NotificationsPanel() {
  const settings = useNotificationSettings();
  const change = useChangeNotificationSettings();

  if (settings.data === undefined && settings.isError) return <ServerUnreachable />;
  const section: SectionProps = {
    saved: settings.data ?? defaultNotificationSettings,
    loading: settings.data === undefined,
    save: (next) => {
      change.mutate(next);
    },
  };

  return (
    <div className="flex flex-col gap-8">
      <WhereSection {...section} />
      {change.isError ? <SaveError /> : null}
    </div>
  );
}

/** What every section gets: the saved settings (the defaults while loading) and one way to save a change. */
interface SectionProps {
  saved: NotificationSettings;
  loading: boolean;
  save: (change: NotificationSettingsChange) => void;
}

function SectionHead({ id, title, line }: { id: string; title: string; line: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="m-0 text-body font-medium">
        {title}
      </h2>
      <p className="m-0 text-small text-muted-foreground">{line}</p>
    </div>
  );
}

function WhereSection({ saved, loading, save }: SectionProps) {
  const ids = { section: useId(), popUps: useId(), desktop: useId() };
  // The desktop app's window is always allowed to notify; a browser asks once (Q6).
  const app = usePlatform().kind === 'desktop';
  const [permission, setPermission] = useState<DesktopPermission>(() => (app ? 'granted' : desktopPermission()));
  const pill = app ? { tone: 'success' as const, text: 'Allowed' } : permissionPills[permission];

  return (
    <section aria-labelledby={ids.section} className="flex flex-col gap-3">
      <SectionHead
        id={ids.section}
        title="Where you get notified"
        line={
          app
            ? 'Orynx shows notifications through your operating system.'
            : 'Orynx runs on your computer, so notifications come from your browser.'
        }
      />
      <SettingList>
        <SettingRow
          title="Pop-ups inside Orynx"
          titleId={ids.popUps}
          description="A small card in the corner while Orynx is open. Also listed under the bell."
          control={
            <Switch
              aria-labelledby={ids.popUps}
              checked={saved.popUps}
              disabled={loading}
              onCheckedChange={(popUps) => {
                save({ popUps });
              }}
            />
          }
        />
        <SettingRow
          title="Desktop notifications"
          titleId={ids.desktop}
          description={
            app
              ? 'Shown by your operating system, even when Orynx is in the background.'
              : 'Shown by your operating system, even when the Orynx tab is in the background.'
          }
          control={
            <Switch
              aria-labelledby={ids.desktop}
              checked={saved.desktop}
              disabled={loading}
              onCheckedChange={(desktop) => {
                save({ desktop });
              }}
            />
          }
        >
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <Pill tone={pill.tone}>{pill.text}</Pill>
            {!app && saved.desktop && permission === 'default' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void askDesktopPermission().then(setPermission);
                }}
              >
                Allow in browser
              </Button>
            ) : null}
          </span>
          <Checkbox
            label={
              app
                ? 'Only when Orynx isn’t the window you’re looking at'
                : 'Only when Orynx isn’t the tab you’re looking at'
            }
            checked={saved.onlyInBackground}
            disabled={loading}
            onChange={(event) => {
              save({ onlyInBackground: event.currentTarget.checked });
            }}
          />
        </SettingRow>
      </SettingList>
    </section>
  );
}
