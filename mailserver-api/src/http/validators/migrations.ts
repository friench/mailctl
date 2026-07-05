import { z } from 'zod';

export const createMigrationSchema = z.object({
  sourceHost: z.string().min(1).max(255),
  sourcePort: z.number().int().min(1).max(65535).optional(),
  sourceUser: z.string().min(1).max(320),
  sourcePassword: z.string().min(1).max(1024),
  sourceSsl: z.enum(['imaps', 'starttls', 'none']).default('imaps'),
  destAddress: z.string().min(3).max(320),
});

export type CreateMigrationBody = z.infer<typeof createMigrationSchema>;
