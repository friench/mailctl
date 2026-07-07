import { z } from 'zod';
import { domainNameSchema, dkimSelectorSchema } from './domains';
import { aliasAddressSchema, aliasTargetSchema } from './aliases';

// Bulk import provisions domains → mailboxes → aliases directly through the
// services, which do not re-run field validation. Reuse the same strict field
// schemas as the single-resource endpoints so this path cannot smuggle control
// chars / traversal into docker-mailserver provisioning (see #66).
export const importDocumentSchema = z
  .object({
    domains: z
      .array(z.object({ name: domainNameSchema, dkimSelector: dkimSelectorSchema.nullish() }))
      .max(1000)
      .optional(),
    mailboxes: z
      .array(
        z.object({
          address: z.email().toLowerCase(),
          password: z.string().min(1).optional(),
          quotaMb: z.number().int().nonnegative().optional(),
          notes: z.string().nullish(),
        }),
      )
      .max(5000)
      .optional(),
    aliases: z
      .array(
        z.object({
          address: aliasAddressSchema,
          target: aliasTargetSchema,
          notes: z.string().nullish(),
        }),
      )
      .max(5000)
      .optional(),
  })
  .refine((d) => d.domains || d.mailboxes || d.aliases, {
    message: 'Provide at least one of domains, mailboxes, or aliases',
  });

export type ImportDocumentBody = z.infer<typeof importDocumentSchema>;
