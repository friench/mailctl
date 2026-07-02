import { describe, it, expect } from 'vitest';
import { sendBodySchema } from '../../src/http/validators/send';

const base = { to: 'r@x.com', subject: 's', html: 'h' };

// 'JVBERi0xLjcK' is a small canonical base64 string (decodes to "%PDF-1.7\n").
const validBase64 = 'JVBERi0xLjcK';

describe('sendBodySchema', () => {
  it('accepts a minimal body (backward compatible)', () => {
    const r = sendBodySchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('accepts text and replyTo', () => {
    const r = sendBodySchema.safeParse({ ...base, text: 'plain', replyTo: 'reply@x.com' });
    expect(r.success).toBe(true);
  });

  it('accepts a valid attachment', () => {
    const r = sendBodySchema.safeParse({
      ...base,
      attachments: [{ filename: 'cv.pdf', content: validBase64, contentType: 'application/pdf' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects more than 10 attachments', () => {
    const r = sendBodySchema.safeParse({
      ...base,
      attachments: Array.from({ length: 11 }, () => ({ filename: 'f.pdf', content: validBase64 })),
    });
    expect(r.success).toBe(false);
  });

  it('rejects attachments exceeding 10 MB total', () => {
    // Two ~6 MB base64 blobs → ~9 MB decoded total each pair > 10 MB.
    const bigContent = 'A'.repeat(8 * 1024 * 1024); // ~6 MB decoded, valid base64 chars, len % 4 === 0
    const r = sendBodySchema.safeParse({
      ...base,
      attachments: [
        { filename: 'a.bin', content: bigContent },
        { filename: 'b.bin', content: bigContent },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-base64 content', () => {
    const r = sendBodySchema.safeParse({
      ...base,
      attachments: [{ filename: 'cv.pdf', content: 'not valid base64!!!' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects filename with a forward slash', () => {
    const r = sendBodySchema.safeParse({
      ...base,
      attachments: [{ filename: 'dir/cv.pdf', content: validBase64 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects filename with a backslash', () => {
    const r = sendBodySchema.safeParse({
      ...base,
      attachments: [{ filename: 'dir\\cv.pdf', content: validBase64 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid replyTo', () => {
    const r = sendBodySchema.safeParse({ ...base, replyTo: 'not-an-email' });
    expect(r.success).toBe(false);
  });
});
