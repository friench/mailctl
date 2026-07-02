import { z } from 'zod';

const entityType = z.enum(['domain', 'mailbox', 'alias', 'dkim']);
const resolution = z.enum(['import', 'push', 'field_pick', 'delete_db', 'delete_dms', 'skip']);

export const applySyncSchema = z.object({
  confirmDeletes: z.boolean().optional(),
  resolutions: z
    .array(
      z.object({
        entityType,
        key: z.string().min(1),
        resolution,
        stateHash: z.string().min(1),
        fields: z.record(z.string(), z.enum(['dms', 'db'])).optional(),
        password: z.string().min(1).optional(),
      }),
    )
    .min(1, 'at least one resolution is required'),
});

export type ApplySyncBody = z.infer<typeof applySyncSchema>;
