import { useQuery } from '@tanstack/react-query';
import { notificationsQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** The bell's list and counts (spec 029). Kept fresh by `notifications.changed`, not polling. */
export function useNotifications() {
  const api = useApi();
  return useQuery(notificationsQueryOptions(api));
}
