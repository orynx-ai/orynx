import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsQueryOptions, queryKeys } from '@devhub/api-client';
import type { MarkNotificationsRead, NotificationList } from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** The bell's list and counts (spec 029). Kept fresh by `notifications.changed`, not polling. */
export function useNotifications() {
  const api = useApi();
  return useQuery(notificationsQueryOptions(api));
}

function withRead(list: NotificationList, request: MarkNotificationsRead): NotificationList {
  const read = (id: string) => 'all' in request || request.ids.includes(id);
  const notifications = list.notifications.map((notification) =>
    read(notification.id) ? { ...notification, read: true } : notification,
  );
  return { ...list, notifications, unread: notifications.filter((notification) => !notification.read).length };
}

/** Marks some notifications read, or all, showing it at once; `notifications.changed` tells the other tabs. */
export function useMarkNotificationsRead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.notifications,
    mutationFn: (request: MarkNotificationsRead) => api.markNotificationsRead(request),
    onMutate: async (request) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      queryClient.setQueryData<NotificationList>(queryKeys.notifications, (list) => list && withRead(list, request));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}
