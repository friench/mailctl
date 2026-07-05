import { z } from 'zod';

export const quarantineBulkSchema = z.object({
  uids: z.array(z.number().int().nonnegative()).min(1).max(500),
  action: z.enum(['release', 'delete']),
});

export type QuarantineBulkBody = z.infer<typeof quarantineBulkSchema>;
