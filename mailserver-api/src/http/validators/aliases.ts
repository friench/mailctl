import { z } from 'zod';
import { domainNameSchema } from './domains';

// Alias address: either a normal `local@domain` or a catch-all / whole-domain
// alias with an empty local part (`@domain`). The domain part is required.
const aliasAddressRegex = /^[^\s@]*@[^\s@]+\.[^\s@]+$/;

// A single alias target token: an email, a whole-domain (`@domain`), or the
// literal `devnull` to blackhole mail. Comma joins multiple tokens.
const aliasTargetTokenRegex = /^(?:devnull|@[^\s@,]+\.[^\s@,]+|[^\s@,]+@[^\s@,]+\.[^\s@,]+)$/;

/** True if the string contains any control char (CR/LF/TAB/NUL/DEL/…). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isValidAliasTarget(value: string): boolean {
  // Reject control chars on the raw string first: an alias target is appended
  // verbatim to postfix-virtual.cf inside the DMS container, so a newline would
  // inject an extra virtual-map line (cross-domain mail redirection / DoS).
  // Checking before trim/split matters — trimming would strip an injected
  // newline and let each side pass token validation individually.
  if (hasControlChar(value)) return false;
  const tokens = value.split(',').map((t) => t.trim());
  return tokens.length > 0 && tokens.every((t) => aliasTargetTokenRegex.test(t));
}

export const aliasAddressSchema = z
  .string()
  .regex(aliasAddressRegex, 'invalid alias address')
  .toLowerCase();

// Target may be an email, a whole-domain (`@domain`), a comma-separated list, or
// the literal `devnull`. Exported so the bulk-import validator reuses it.
export const aliasTargetSchema = z
  .string()
  .min(1, 'target is required')
  .max(1024)
  .refine(isValidAliasTarget, {
    message: 'target must be a comma-separated list of email addresses, @domain, or devnull',
  });

export const createAliasSchema = z.object({
  address: aliasAddressSchema,
  target: aliasTargetSchema,
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateAliasBody = z.infer<typeof createAliasSchema>;

export const updateAliasSchema = z.object({
  target: aliasTargetSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type UpdateAliasBody = z.infer<typeof updateAliasSchema>;

/** Generate a random temporary alias (`tmp-<hex>@domain`) → target, optional TTL. */
export const generateTempAliasSchema = z.object({
  domain: domainNameSchema,
  target: aliasTargetSchema,
  /** Time-to-live in hours (max 1 year). Omit for a non-expiring temp alias. */
  ttlHours: z.number().int().positive().max(8760).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type GenerateTempAliasBody = z.infer<typeof generateTempAliasSchema>;
