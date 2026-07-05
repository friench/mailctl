import { describe, it, expect } from 'vitest';
import { makeSecretBox } from '../../src/lib/secret-box';

const SECRET = 'a'.repeat(64);

describe('makeSecretBox', () => {
  it('round-trips a value', () => {
    const box = makeSecretBox(SECRET);
    const token = box.encrypt('hunter2');
    expect(token).not.toContain('hunter2');
    expect(box.decrypt(token)).toBe('hunter2');
  });

  it('produces a different token each time (random IV)', () => {
    const box = makeSecretBox(SECRET);
    expect(box.encrypt('x')).not.toBe(box.encrypt('x'));
  });

  it('fails to decrypt a tampered token', () => {
    const box = makeSecretBox(SECRET);
    const token = box.encrypt('secret');
    const buf = Buffer.from(token, 'base64');
    const last = buf.length - 1;
    buf[last] = (buf[last] ?? 0) ^ 0xff;
    expect(() => box.decrypt(buf.toString('base64'))).toThrow();
  });

  it('cannot decrypt with a different secret', () => {
    const token = makeSecretBox(SECRET).encrypt('secret');
    expect(() => makeSecretBox('b'.repeat(64)).decrypt(token)).toThrow();
  });

  it('rejects a too-short secret', () => {
    expect(() => makeSecretBox('short')).toThrow();
  });

  it('handles unicode', () => {
    const box = makeSecretBox(SECRET);
    expect(box.decrypt(box.encrypt('пароль🔒'))).toBe('пароль🔒');
  });
});
