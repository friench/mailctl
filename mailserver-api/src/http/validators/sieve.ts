import { z } from 'zod';

const ruleSchema = z.object({
  field: z.enum(['from', 'to', 'subject']),
  contains: z.string().min(1).max(500),
  action: z.enum(['fileinto', 'redirect', 'discard']),
  arg: z.string().max(500).optional(),
});

export const sieveConfigSchema = z.object({
  vacation: z.object({
    enabled: z.boolean(),
    subject: z.string().max(200).default(''),
    message: z.string().max(4000).default(''),
    days: z.number().int().min(1).max(365).default(7),
  }),
  rules: z.array(ruleSchema).max(50),
});

export type SieveConfigBody = z.infer<typeof sieveConfigSchema>;
