import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailListSchema = z
  .string()
  .min(1, 'to is required')
  .refine((val) => val.split(',').every((email) => emailRegex.test(email.trim())), {
    message: 'Invalid email address(es) in "to"',
  })
  .refine((val) => val.split(',').length <= 50, {
    message: 'too many recipients',
  });

/** True if `s` is canonical, whitespace-free base64 that round-trips cleanly. */
function isBase64(s: string): boolean {
  if (s.length === 0 || s.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return false;
  return Buffer.from(s, 'base64').toString('base64') === s;
}

/** Approximate sum of decoded bytes across attachments (3 bytes per 4 base64 chars). */
function totalDecodedBytes(attachments: Array<{ content: string }>): number {
  return attachments.reduce((sum, a) => sum + Math.floor((a.content.length * 3) / 4), 0);
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB total

const attachmentSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .refine((f) => !/[/\\]/.test(f), 'filename must not contain path separators'),
  content: z.string().min(1).refine(isBase64, 'content must be base64'),
  contentType: z.string().min(1).max(128).optional(),
});

export const sendBodySchema = z.object({
  from: z
    .string()
    .refine((v) => !/[\r\n]/.test(v), 'must not contain line breaks')
    .optional(),
  to: emailListSchema,
  subject: z
    .string()
    .min(1, 'subject is required')
    .refine((v) => !/[\r\n]/.test(v), 'must not contain line breaks'),
  html: z.string().min(1, 'html is required'),
  text: z.string().optional(),
  replyTo: z.string().regex(emailRegex, 'invalid replyTo').optional(),
  attachments: z
    .array(attachmentSchema)
    .max(10, 'at most 10 attachments')
    .optional()
    .refine(
      (a) => !a || totalDecodedBytes(a) <= MAX_ATTACHMENT_BYTES,
      'attachments exceed 10 MB total',
    ),
});

export type SendBody = z.infer<typeof sendBodySchema>;
