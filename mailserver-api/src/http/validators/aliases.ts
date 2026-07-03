import { z } from 'zod';

// Alias address: either a normal `local@domain` or a catch-all / whole-domain
// alias with an empty local part (`@domain`). The domain part is required.
const aliasAddressRegex = /^[^\s@]*@[^\s@]+\.[^\s@]+$/;

export const createAliasSchema = z.object({
  address: z.string().regex(aliasAddressRegex, 'invalid alias address').toLowerCase(),
  // Target may be an email, a whole-domain (`@domain`), a comma-separated list, or
  // the literal `devnull` to blackhole/discard mail for the address.
  target: z.string().min(1, 'target is required').max(1024),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateAliasBody = z.infer<typeof createAliasSchema>;
