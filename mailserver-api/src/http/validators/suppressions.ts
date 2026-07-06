import { z } from 'zod';

export const createSuppressionSchema = z.object({
  address: z.string().min(3).max(320),
  reason: z.enum(['hard_bounce', 'complaint', 'manual', 'unsubscribe']).default('manual'),
  note: z.string().max(500).nullish(),
});

export type CreateSuppressionBody = z.infer<typeof createSuppressionSchema>;
