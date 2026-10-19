import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationSettingsQueryOptions, notificationsQueryOptions, queryKeys } from '@devhub/api-client';
import {
  withNotificationChange,
  type MarkNotificationsRead,
  type NotificationList,
  type NotificationSettings,
  type NotificationSettingsChange,
} from '@devhub/contracts';
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

/** Settings › Notifications (spec 029). Kept fresh by `settings.changed`, not polling. */
export function useNotificationSettings() {
  const api = useApi();
  return useQuery(notificationSettingsQueryOptions(api));
}

/**
 * Saves one change, showing it at once. A failed save reads the settings again, so the control goes back to what
 * the server holds; a refetch waits for the last of several quick changes, so an early answer can't undo a later one.
 */
export function useChangeNotificationSettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.notificationSettings,
    mutationFn: (change: NotificationSettingsChange) => api.changeNotificationSettings(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationSettings });
      queryClient.setQueryData<NotificationSettings>(
        queryKeys.notificationSettings,
        (settings) => settings && withNotificationChange(settings, change),
      );
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: queryKeys.notificationSettings }) === 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings });
      }
    },
  });
}
