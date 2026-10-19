import { useState } from 'react';
import { NotificationPanel, NotificationPanelContent, NotificationPanelTrigger, type TooltipProps } from '@devhub/ui';
import { useNotifications } from '../queries.ts';

export interface NotificationCentreProps {
  /** Where the panel opens: beside the sidebar's foot by default, below the narrow top bar's bell. */
  side?: 'right' | 'bottom';
  tooltipSide?: TooltipProps['side'];
}

/** The bell and its panel (spec 029). The bell sits at the bottom of the sidebar: the user's change to the design. */
export function NotificationCentre({ side = 'right', tooltipSide }: NotificationCentreProps) {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <NotificationPanel open={open} onOpenChange={setOpen}>
      <NotificationPanelTrigger unread={notifications.data?.unread ?? 0} tooltipSide={tooltipSide} />
      <NotificationPanelContent side={side} align="end" />
    </NotificationPanel>
  );
}
