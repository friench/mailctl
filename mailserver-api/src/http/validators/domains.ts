import { z } from 'zod';

const domainNameRegex =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const createDomainSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(253)
    .toLowerCase()
    .refine((v) => domainNameRegex.test(v), { message: 'Invalid domain name' }),
  dkimSelector: z.string().min(1).max(63).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateDomainSchema = z.object({
  dkimSelector: z.string().min(1).max(63).nullable().optional(),
  dkimPublicKey: z.string().nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const dkimSelectorRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export const regenerateDkimSchema = z.object({
  selector: z
    .string()
    .min(1)
    .max(63)
    .refine((v) => dkimSelectorRegex.test(v), { message: 'Invalid DKIM selector' })
    .optional(),
  keysize: z
    .union([z.literal(2048), z.literal(4096)])
    .optional()
    .default(2048),
});

export type CreateDomainBody = z.infer<typeof createDomainSchema>;
export type UpdateDomainBody = z.infer<typeof updateDomainSchema>;
export type RegenerateDkimBody = z.infer<typeof regenerateDkimSchema>;
