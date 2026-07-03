import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createAliasSchema = z.object({
  address: z.string().regex(emailRegex, 'invalid alias address'),
  target: z.string().min(1, 'target is required').max(1024),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateAliasBody = z.infer<typeof createAliasSchema>;
