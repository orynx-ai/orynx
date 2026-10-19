import { useState } from 'react';
import { Notification01Icon } from '@hugeicons/core-free-icons';
import { defaultNotificationSettings } from '@devhub/contracts';
import { Button, Icon } from '@devhub/ui';
import { desktopPermission } from '../../notifications/desktop.ts';
import { useNotificationSettings } from '../../notifications/queries.ts';
import { playSound, soundNames } from '../../notifications/sounds.ts';
import { useTestPopUpStore } from '../../notifications/store.ts';
import { testWords } from '../../notifications/words.ts';

/**
 * Settings › Notifications' page bar (spec 029, AC-42): sends a test as an approval would reach you, Do not disturb
 * or not, and says whether you should have heard it. The test never joins the list.
 */
export function TestNotification() {
  const settings = useNotificationSettings().data ?? defaultNotificationSettings;
  const showPopUp = useTestPopUpStore((state) => state.show);
  const [sent, setSent] = useState<string | null>(null);

  return (
    <>
      {/* Under 768 px the bar has room only for the crumbs and the button. */}
      <span role="status" className="text-small text-muted-foreground max-md:sr-only">
        {sent ?? 'Changes save automatically'}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          const approval = settings.events.approval;
          if (settings.popUps && approval.popUp) showPopUp();
          if (settings.desktop && approval.desktop && desktopPermission() === 'granted') {
            new Notification(testWords.title, { body: testWords.detail, tag: 'test' });
          }
          const sound = settings.sounds && approval.sound !== 'none' ? approval.sound : null;
          if (sound !== null) playSound(sound, settings.volume);
          setSent(sound === null ? 'Sent, without sound.' : `Sent. You should have heard ${soundNames[sound]}.`);
        }}
      >
        <Icon icon={Notification01Icon} aria-hidden />
        Send a test notification
      </Button>
    </>
  );
}
