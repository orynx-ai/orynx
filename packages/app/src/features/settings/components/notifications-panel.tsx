import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PlayIcon, VolumeHighIcon } from '@hugeicons/core-free-icons';
import {
  defaultNotificationSettings,
  NotificationSoundSchema,
  PauseLengthSchema,
  QuietHoursSchema,
  type NotificationEvent,
  type PauseLength,
  type QuietHours,
  type NotificationSettings,
  type NotificationSettingsChange,
} from '@devhub/contracts';
import {
  Button,
  Checkbox,
  Field,
  FilterChip,
  Icon,
  IconButton,
  Input,
  Pill,
  Select,
  SettingList,
  SettingRow,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@devhub/ui';
import { pausedNow, pauseUntil } from '../../notifications/quiet.ts';
import { playSound, soundNames, type PlayableSound } from '../../notifications/sounds.ts';
import { useNow } from '../../../words/use-now.ts';
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
      <SoundSection {...section} />
      <EventsSection {...section} />
      <DoNotDisturbSection {...section} />
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
            onCheckedChange={(checked) => {
              save({ onlyInBackground: checked === true });
            }}
          />
        </SettingRow>
      </SettingList>
    </section>
  );
}

const playable = NotificationSoundSchema.options.filter((sound): sound is PlayableSound => sound !== 'none');

function SoundSection({ saved, loading, save }: SectionProps) {
  const ids = { section: useId(), sounds: useId(), volume: useId(), library: useId() };
  const off = loading || !saved.sounds;
  const volume = `${String(saved.volume)}%`;

  return (
    <section aria-labelledby={ids.section} className="flex flex-col gap-3">
      <SectionHead
        id={ids.section}
        title="Sound"
        line="Each kind of notification can have its own sound. Press Play to hear one."
      />
      <SettingList>
        <SettingRow
          title="Play sounds"
          titleId={ids.sounds}
          description="Turns every sound on or off. Do not disturb also silences them."
          control={
            <Switch
              aria-labelledby={ids.sounds}
              checked={saved.sounds}
              disabled={loading}
              onCheckedChange={(sounds) => {
                save({ sounds });
              }}
            />
          }
        />
        <SettingRow title="Volume" titleFor={ids.volume}>
          <span className="mt-1.5 flex items-center gap-3">
            <Icon icon={VolumeHighIcon} aria-hidden className="text-muted-foreground" />
            <Slider
              id={ids.volume}
              min={0}
              max={100}
              step={5}
              value={saved.volume}
              aria-valuetext={volume}
              disabled={off}
              className="max-w-80"
              onChange={(event) => {
                save({ volume: Number(event.currentTarget.value) });
              }}
            />
            <span className="w-10 text-small text-muted-foreground">{volume}</span>
          </span>
        </SettingRow>
        <SettingRow title="Sounds" titleId={ids.library}>
          <ul aria-labelledby={ids.library} className="mt-1.5 flex flex-wrap gap-2">
            {playable.map((sound) => (
              <li key={sound} className="flex items-center gap-1 rounded-sm border border-border ps-3 pe-1">
                {soundNames[sound]}
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={`Play ${soundNames[sound]}`}
                  disabled={off}
                  onClick={() => {
                    playSound(sound, saved.volume);
                  }}
                >
                  <Icon icon={PlayIcon} aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        </SettingRow>
      </SettingList>
    </section>
  );
}

/** Settings' rows, grouped as the design draws them; automations (024) and Slack (016) join with their features. */
const eventGroups: readonly {
  heading: string;
  events: readonly { id: NotificationEvent; label: string; line: string }[];
}[] = [
  {
    heading: 'Claude sessions',
    events: [
      {
        id: 'approval',
        label: 'Claude is waiting for your approval',
        line: 'A command, an edit, a push or a pull request needs your click',
      },
      { id: 'session_finished', label: 'Session finished', line: 'Ready for you to review the changes' },
      { id: 'session_ended', label: 'Session failed or stopped', line: 'An error, or you pressed Stop' },
      { id: 'session_limit', label: 'Session hit a limit', line: 'Claude’s usage limit ended it' },
    ],
  },
  {
    heading: 'Inbox',
    events: [
      { id: 'review_requested', label: 'Someone asked for your review', line: 'On GitHub' },
      { id: 'checks_failed', label: 'Checks failed on your pull request', line: 'On GitHub' },
      { id: 'jira_assigned', label: 'Jira ticket assigned to you', line: 'In Jira' },
    ],
  },
];

function EventsSection({ saved, loading, save }: SectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <SectionHead
        id={id}
        title="What you’re told about"
        line="Everything is always listed under the bell. These choose what also pops up, shows on your desktop, or plays a sound."
      />
      <div className="rounded-md border border-border bg-raised">
        <Table caption="Notification choices by event">
          <TableHeader className="max-sm:sr-only">
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Pop-up</TableHead>
              <TableHead>Desktop</TableHead>
              <TableHead>Sound</TableHead>
            </TableRow>
          </TableHeader>
          {eventGroups.map((group) => (
            <TableBody key={group.heading}>
              <TableRow>
                <TableHead scope="colgroup" colSpan={4} className="bg-sidebar text-label">
                  {group.heading}
                </TableHead>
              </TableRow>
              {group.events.map((event) => {
                const choice = saved.events[event.id];
                return (
                  // Under 640 px each event is a block: its name, then its three choices on one line (Q6).
                  <TableRow
                    key={event.id}
                    className="max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-4 max-sm:py-2"
                  >
                    <TableCell className="whitespace-normal max-sm:basis-full">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        {event.label}
                        {event.id === 'approval' ? <Pill tone="warning">Needs you</Pill> : null}
                      </span>
                      <span>{event.line}</span>
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        aria-label={`Pop-up for ${event.label}`}
                        label={<span className="sm:sr-only">Pop-up</span>}
                        className="min-h-10 py-0"
                        checked={choice.popUp}
                        disabled={loading}
                        onCheckedChange={(checked) => {
                          save({ events: { [event.id]: { popUp: checked === true } } });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        aria-label={`Desktop notification for ${event.label}`}
                        label={<span className="sm:sr-only">Desktop</span>}
                        className="min-h-10 py-0"
                        checked={choice.desktop}
                        disabled={loading}
                        onCheckedChange={(checked) => {
                          save({ events: { [event.id]: { desktop: checked === true } } });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <Select
                          aria-label={`Sound for ${event.label}`}
                          className="w-32"
                          value={choice.sound}
                          disabled={loading || !saved.sounds}
                          onChange={(change) => {
                            const sound = NotificationSoundSchema.parse(change.currentTarget.value);
                            save({ events: { [event.id]: { sound } } });
                            // Picking a sound plays it (AC-39).
                            if (sound !== 'none') playSound(sound, saved.volume);
                          }}
                        >
                          {NotificationSoundSchema.options.map((sound) => (
                            <option key={sound} value={sound}>
                              {soundNames[sound]}
                            </option>
                          ))}
                        </Select>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          label={`Play the sound for ${event.label}`}
                          disabled={loading || !saved.sounds || choice.sound === 'none'}
                          onClick={() => {
                            if (choice.sound !== 'none') playSound(choice.sound, saved.volume);
                          }}
                        >
                          <Icon icon={PlayIcon} aria-hidden />
                        </IconButton>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          ))}
        </Table>
      </div>
    </section>
  );
}

const pauseNames: Record<PauseLength, string> = {
  hour: 'For 1 hour',
  tomorrow: 'Until 9:00 tomorrow',
  until_off: 'Until I turn it off',
};

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DoNotDisturbSection({ saved, loading, save }: SectionProps) {
  const ids = { section: useId(), pause: useId(), quiet: useId(), breakLine: useId() };
  const now = useNow();
  const { length } = saved.doNotDisturb;
  // Past its end it has turned itself off (AC-31).
  const paused = pausedNow(saved.doNotDisturb, now);
  // From and to keep what you typed until it can be saved: equal times say why and aren't sent (AC-41).
  const form = useForm<QuietHours>({ values: saved.quietHours, resolver: zodResolver(QuietHoursSchema) });
  const saveHours = form.handleSubmit((quietHours) => {
    save({ quietHours });
  });
  const pause = (on: boolean, picked: PauseLength) => {
    save({ doNotDisturb: { on, length: picked, until: on ? pauseUntil(picked, new Date()) : null } });
  };

  return (
    <section aria-labelledby={ids.section} className="flex flex-col gap-3">
      <SectionHead
        id={ids.section}
        title="Do not disturb"
        line="Pauses pop-ups, desktop notifications and sounds. They still collect under the bell."
      />
      <SettingList>
        <SettingRow
          title="Pause now"
          titleId={ids.pause}
          description={
            paused
              ? `Paused ${pauseNames[length].charAt(0).toLowerCase()}${pauseNames[length].slice(1)}.`
              : 'Off. Notifications and sounds are on.'
          }
          control={
            <>
              <Select
                aria-label="Pause for"
                className="w-48"
                value={length}
                disabled={loading}
                onChange={(event) => {
                  pause(paused, PauseLengthSchema.parse(event.currentTarget.value));
                }}
              >
                {PauseLengthSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {pauseNames[option]}
                  </option>
                ))}
              </Select>
              <Switch
                aria-labelledby={ids.pause}
                checked={paused}
                disabled={loading}
                onCheckedChange={(on) => {
                  pause(on, length);
                }}
              />
            </>
          }
        />
        <SettingRow
          title="Quiet hours"
          titleId={ids.quiet}
          control={
            <Switch
              aria-labelledby={ids.quiet}
              checked={saved.quietHours.on}
              disabled={loading}
              onCheckedChange={(on) => {
                save({ quietHours: { ...saved.quietHours, on } });
              }}
            />
          }
        >
          <form aria-labelledby={ids.quiet} noValidate className="mt-1.5 flex flex-col gap-3">
            <span className="flex flex-wrap items-start gap-3">
              <Field label="From" className="w-36">
                <Input
                  type="time"
                  disabled={loading}
                  {...form.register('from', { onChange: () => void saveHours() })}
                />
              </Field>
              <Field label="to" className="w-36" error={form.formState.errors.to?.message}>
                <Input type="time" disabled={loading} {...form.register('to', { onChange: () => void saveHours() })} />
              </Field>
            </span>
            <span role="group" aria-label="Days" className="flex flex-wrap gap-1.5">
              {dayNames.map((day, index) => (
                <FilterChip
                  key={day}
                  pressed={saved.quietHours.days[index] === true}
                  disabled={loading}
                  onPressedChange={(on) => {
                    save({
                      quietHours: {
                        ...saved.quietHours,
                        days: saved.quietHours.days.map((was, at) => (at === index ? on : was)),
                      },
                    });
                  }}
                >
                  {day}
                </FilterChip>
              ))}
            </span>
          </form>
        </SettingRow>
        <div className="px-4">
          <Checkbox
            aria-label="Still tell me when Claude is waiting for approval"
            aria-describedby={ids.breakLine}
            label={
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Still tell me when Claude is waiting for approval</span>
                <span id={ids.breakLine} className="text-small text-muted-foreground">
                  Otherwise a session can sit paused all night.
                </span>
              </span>
            }
            checked={saved.approvalsBreakThrough}
            disabled={loading}
            onCheckedChange={(checked) => {
              save({ approvalsBreakThrough: checked === true });
            }}
          />
        </div>
      </SettingList>
    </section>
  );
}
