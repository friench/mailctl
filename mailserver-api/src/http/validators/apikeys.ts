import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  suppressionExempt: z.boolean().optional(),
  expiresAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'expiresAt must be an ISO date string')
    .optional(),
});

export type CreateApiKeyBody = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  suppressionExempt: z.boolean(),
});
