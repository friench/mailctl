import { z } from 'zod';

export const createFetchmailSchema = z.object({
  pollServer: z.string().min(1).max(255),
  protocol: z.enum(['imap', 'pop3']),
  port: z.number().int().min(1).max(65535).nullish(),
  username: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
  destAddress: z.string().min(3).max(320),
  ssl: z.boolean().default(true),
  keep: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const updateFetchmailSchema = z.object({
  active: z.boolean(),
});

export type CreateFetchmailBody = z.infer<typeof createFetchmailSchema>;
