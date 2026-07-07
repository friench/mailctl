import { z } from 'zod';

const domainNameRegex =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const dkimSelectorRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Domain name and DKIM selector both become path components inside the DMS
 * container (e.g. `.../opendkim/keys/<domain>/<selector>.txt`), so they are
 * strictly validated to prevent traversal / config injection. Exported so the
 * bulk-import validator reuses them and that path can never bypass the checks.
 */
export const domainNameSchema = z
  .string()
  .min(1)
  .max(253)
  .toLowerCase()
  .refine((v) => domainNameRegex.test(v), { message: 'Invalid domain name' });

export const dkimSelectorSchema = z
  .string()
  .min(1)
  .max(63)
  .refine((v) => dkimSelectorRegex.test(v), { message: 'Invalid DKIM selector' });

export const createDomainSchema = z.object({
  name: domainNameSchema,
  dkimSelector: dkimSelectorSchema.optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateDomainSchema = z.object({
  dkimSelector: dkimSelectorSchema.nullable().optional(),
  dkimPublicKey: z.string().nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const regenerateDkimSchema = z.object({
  selector: dkimSelectorSchema.optional(),
  keysize: z
    .union([z.literal(2048), z.literal(4096)])
    .optional()
    .default(2048),
});

export type CreateDomainBody = z.infer<typeof createDomainSchema>;
export type UpdateDomainBody = z.infer<typeof updateDomainSchema>;
export type RegenerateDkimBody = z.infer<typeof regenerateDkimSchema>;
