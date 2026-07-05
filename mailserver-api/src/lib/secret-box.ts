import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Small authenticated-encryption helper for secrets that must be stored at rest
 * yet recovered later (e.g. a migration job's source-IMAP password, needed when
 * the worker runs the job). AES-256-GCM with a key derived from SESSION_SECRET.
 *
 * Token layout (base64): [12-byte IV][16-byte GCM tag][ciphertext].
 */
export interface SecretBox {
  encrypt(plaintext: string): string;
  decrypt(token: string): string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function makeSecretBox(secret: string): SecretBox {
  if (!secret || secret.length < 16) {
    throw new Error('SecretBox secret must be at least 16 characters');
  }
  const key = scryptSync(secret, 'mailctl-secret-box-v1', 32);

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, ct]).toString('base64');
    },
    decrypt(token: string): string {
      const buf = Buffer.from(token, 'base64');
      if (buf.length < IV_BYTES + TAG_BYTES) throw new Error('Malformed secret token');
      const iv = buf.subarray(0, IV_BYTES);
      const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
      const ct = buf.subarray(IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    },
  };
}
