import { z } from 'zod';
import { WEBHOOK_EVENTS } from '../../db/schema';

const eventName = z.enum(WEBHOOK_EVENTS);

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.url().refine((v) => v.startsWith('http://') || v.startsWith('https://'), {
    message: 'URL must be http(s)',
  }),
  events: z.array(eventName).min(1, 'At least one event is required'),
  active: z.boolean().optional(),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z
    .url()
    .refine((v) => v.startsWith('http://') || v.startsWith('https://'), {
      message: 'URL must be http(s)',
    })
    .optional(),
  events: z.array(eventName).min(1).optional(),
  active: z.boolean().optional(),
});

export type CreateWebhookBody = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookBody = z.infer<typeof updateWebhookSchema>;
