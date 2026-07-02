import { z } from 'zod';

const passwordSchema = z.string().min(8).max(128);

export const createMailboxSchema = z.object({
  address: z.email().toLowerCase(),
  password: passwordSchema,
  quotaMb: z.number().int().positive().max(1_000_000).optional(),
});

export const updateMailboxSchema = z.object({
  quotaMb: z.number().int().positive().max(1_000_000).nullable().optional(),
  active: z.boolean().optional(),
});

export const updatePasswordSchema = z.object({
  password: passwordSchema,
});

export type CreateMailboxBody = z.infer<typeof createMailboxSchema>;
export type UpdateMailboxBody = z.infer<typeof updateMailboxSchema>;
export type UpdatePasswordBody = z.infer<typeof updatePasswordSchema>;
