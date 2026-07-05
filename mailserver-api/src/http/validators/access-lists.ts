import { z } from 'zod';

export const createAccessRuleSchema = z.object({
  matchType: z.enum(['email', 'domain', 'ip']),
  action: z.enum(['allow', 'block']),
  value: z.string().min(1).max(320),
  recipient: z.string().max(320).nullish(),
  note: z.string().max(500).nullish(),
});

export type CreateAccessRuleBody = z.infer<typeof createAccessRuleSchema>;
