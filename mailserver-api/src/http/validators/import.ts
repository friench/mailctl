import { z } from 'zod';

export const importDocumentSchema = z
  .object({
    domains: z
      .array(z.object({ name: z.string().min(1), dkimSelector: z.string().nullish() }))
      .max(1000)
      .optional(),
    mailboxes: z
      .array(
        z.object({
          address: z.string().min(3),
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
          address: z.string().min(3),
          target: z.string().min(1),
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
