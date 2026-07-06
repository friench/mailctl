import { z } from 'zod';

const envVarName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'env var name must be UPPER_SNAKE_CASE');

export const createSmtpAccountSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  requireTls: z.boolean().optional(),
  rejectUnauthorized: z.boolean().nullable().optional(),
  minTlsVersion: z.enum(['TLSv1.2', 'TLSv1.3']).nullable().optional(),
  userEnvVar: envVarName.nullable().optional(),
  passwordEnvVar: envVarName.nullable().optional(),
  fromAddress: z.email(),
  fromName: z.string().min(1).max(100).nullable().optional(),
  priority: z.number().int().min(0).max(1000),
  active: z.boolean().optional(),
  domainId: z.uuid().nullable().optional(),
});

export const updateSmtpAccountSchema = createSmtpAccountSchema.partial();

export type CreateSmtpAccountBody = z.infer<typeof createSmtpAccountSchema>;
export type UpdateSmtpAccountBody = z.infer<typeof updateSmtpAccountSchema>;
