import { z } from 'zod';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import {
  apiPaths,
  MarkNotificationsReadSchema,
  NotificationListSchema,
  NotificationSettingsChangeSchema,
  NotificationSettingsSchema,
} from '@devhub/contracts';
import type { NotificationService } from '../notifications/notification-service.ts';
import type { NotificationSettingsService } from '../notifications/notification-settings.ts';

/** The bell and Settings › Notifications (spec 029). Allow once goes through the session's own approval route. */
export const notificationsRoutes: FastifyPluginCallbackZod<{
  notifications: NotificationService;
  settings: NotificationSettingsService;
}> = (app, { notifications, settings }, done) => {
  app.get(apiPaths.notifications, { schema: { response: { 200: NotificationListSchema } } }, () =>
    notifications.list(),
  );

  app.post(
    apiPaths.notificationsRead,
    { schema: { body: MarkNotificationsReadSchema, response: { 204: z.undefined() } } },
    async (request, reply) => {
      notifications.markRead(request.body);
      return reply.code(204).send();
    },
  );

  app.get(apiPaths.notificationSettings, { schema: { response: { 200: NotificationSettingsSchema } } }, () =>
    settings.read(),
  );

  app.patch(
    apiPaths.notificationSettings,
    { schema: { body: NotificationSettingsChangeSchema, response: { 200: NotificationSettingsSchema } } },
    (request) => settings.change(request.body),
  );

  done();
};
