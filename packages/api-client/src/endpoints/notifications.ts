import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  NotificationListSchema,
  NotificationSettingsSchema,
  type MarkNotificationsRead,
  type NotificationList,
  type NotificationSettings,
  type NotificationSettingsChange,
} from '@devhub/contracts';

export async function getNotifications(http: AxiosInstance): Promise<NotificationList> {
  const res = await http.get<unknown>(apiRoutes.notifications);
  return NotificationListSchema.parse(res.data);
}

export async function postNotificationsRead(http: AxiosInstance, request: MarkNotificationsRead): Promise<void> {
  await http.post(apiRoutes.notificationsRead, request);
}

export async function getNotificationSettings(http: AxiosInstance): Promise<NotificationSettings> {
  const res = await http.get<unknown>(apiRoutes.notificationSettings);
  return NotificationSettingsSchema.parse(res.data);
}

/** Saves one change; the answer holds every setting. */
export async function patchNotificationSettings(
  http: AxiosInstance,
  change: NotificationSettingsChange,
): Promise<NotificationSettings> {
  const res = await http.patch<unknown>(apiRoutes.notificationSettings, change);
  return NotificationSettingsSchema.parse(res.data);
}
