import { describe, it, expect, beforeEach } from 'vitest';
import { FakeDmsClient } from '../helpers/fake-dms';

describe('FakeDmsClient DKIM helpers', () => {
  let dms: FakeDmsClient;
  beforeEach(() => (dms = new FakeDmsClient()));

  it('records generateDkim calls and stores the entry', async () => {
    await dms.generateDkim('example.com', 'mail', 2048);
    expect(dms.calls).toContainEqual({
      method: 'generateDkim',
      args: ['example.com', 'mail', 2048],
    });
    expect(dms.dkim.get('example.com')).toMatchObject({ selector: 'mail', keysize: 2048 });
  });

  it('readDkimPublicKey returns the stored fake key', async () => {
    await dms.generateDkim('example.com', 'mail', 2048);
    const key = await dms.readDkimPublicKey('example.com', 'mail');
    expect(key).toMatch(/^MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A/);
  });

  it('readDkimPublicKey throws when domain not generated', async () => {
    await expect(dms.readDkimPublicKey('absent.com', 'mail')).rejects.toThrow(/not found/);
  });

  it('readDkimPublicKey throws when selector mismatches', async () => {
    await dms.generateDkim('example.com', 'mail', 2048);
    await expect(dms.readDkimPublicKey('example.com', 'other')).rejects.toThrow(/not found/);
  });

  it('respects injected error overrides', async () => {
    dms.errors.generateDkim = new Error('boom');
    await expect(dms.generateDkim('a.com', 'mail', 2048)).rejects.toThrow('boom');
  });
});
