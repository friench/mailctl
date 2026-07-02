import { describe, it, expect } from 'vitest';
import { diff } from '../../src/domain/sync/diff';
import type { DbState, DmsState } from '../../src/domain/sync/types';

const emptyDms: DmsState = { domains: [], mailboxes: [], aliases: [], dkim: [] };
const emptyDb: DbState = { domains: [], mailboxes: [], aliases: [] };

function find(items: ReturnType<typeof diff>, entityType: string, key: string) {
  return items.find((i) => i.entityType === entityType && i.key === key);
}

describe('sync diff', () => {
  it('returns no items when both sides match', () => {
    const dms: DmsState = {
      domains: ['example.com'],
      mailboxes: [{ address: 'a@example.com', quotaMb: 100 }],
      aliases: [{ address: 'x@example.com', target: 'a@example.com' }],
      dkim: [],
    };
    const db: DbState = {
      domains: [{ name: 'example.com', dkimSelector: null, dkimPublicKey: null }],
      mailboxes: [{ address: 'a@example.com', quotaMb: 100 }],
      aliases: [{ address: 'x@example.com', target: 'a@example.com' }],
    };
    expect(diff(dms, db)).toEqual([]);
  });

  it('flags a domain only in DMS as importable', () => {
    const item = find(diff({ ...emptyDms, domains: ['new.com'] }, emptyDb), 'domain', 'new.com');
    expect(item?.divergence).toBe('only_in_dms');
    expect(item?.availableResolutions).toEqual(['import', 'skip']);
    expect(item?.suggestedResolution).toBe('import');
  });

  it('flags a domain only in DB as deletable', () => {
    const db: DbState = {
      ...emptyDb,
      domains: [{ name: 'old.com', dkimSelector: null, dkimPublicKey: null }],
    };
    const item = find(diff(emptyDms, db), 'domain', 'old.com');
    expect(item?.divergence).toBe('only_in_db');
    expect(item?.availableResolutions).toEqual(['delete_db', 'skip']);
  });

  it('flags a mailbox only in DMS with import/delete_dms options', () => {
    const dms: DmsState = {
      ...emptyDms,
      domains: ['example.com'],
      mailboxes: [{ address: 'a@example.com', quotaMb: null }],
    };
    const item = find(diff(dms, emptyDb), 'mailbox', 'a@example.com');
    expect(item?.divergence).toBe('only_in_dms');
    expect(item?.availableResolutions).toEqual(['import', 'delete_dms', 'skip']);
  });

  it('flags a mailbox only in DB with push/delete_db options', () => {
    const db: DbState = { ...emptyDb, mailboxes: [{ address: 'a@example.com', quotaMb: 50 }] };
    const item = find(diff(emptyDms, db), 'mailbox', 'a@example.com');
    expect(item?.divergence).toBe('only_in_db');
    expect(item?.availableResolutions).toEqual(['push', 'delete_db', 'skip']);
  });

  it('flags a quota mismatch as a field_conflict', () => {
    const dms: DmsState = {
      ...emptyDms,
      domains: ['example.com'],
      mailboxes: [{ address: 'a@example.com', quotaMb: 200 }],
    };
    const db: DbState = {
      domains: [{ name: 'example.com', dkimSelector: null, dkimPublicKey: null }],
      mailboxes: [{ address: 'a@example.com', quotaMb: 100 }],
      aliases: [],
    };
    const item = find(diff(dms, db), 'mailbox', 'a@example.com');
    expect(item?.divergence).toBe('field_conflict');
    expect(item?.availableResolutions).toEqual(['field_pick', 'skip']);
    expect(item?.dmsState).toMatchObject({ quotaMb: 200 });
    expect(item?.dbState).toMatchObject({ quotaMb: 100 });
  });

  it('flags an alias target conflict', () => {
    const dms: DmsState = {
      ...emptyDms,
      domains: ['example.com'],
      aliases: [{ address: 'x@example.com', target: 'a@example.com' }],
    };
    const db: DbState = {
      domains: [{ name: 'example.com', dkimSelector: null, dkimPublicKey: null }],
      mailboxes: [],
      aliases: [{ address: 'x@example.com', target: 'b@example.com' }],
    };
    const item = find(diff(dms, db), 'alias', 'x@example.com');
    expect(item?.divergence).toBe('field_conflict');
  });

  it('flags DKIM present only in DMS as importable, and a key mismatch as a conflict', () => {
    const onlyDms: DmsState = {
      ...emptyDms,
      domains: ['example.com'],
      dkim: [{ domain: 'example.com', selector: 'mail', publicKey: 'AAA' }],
    };
    const importItem = find(diff(onlyDms, emptyDb), 'dkim', 'example.com');
    expect(importItem?.divergence).toBe('only_in_dms');
    expect(importItem?.availableResolutions).toEqual(['import', 'skip']);

    const db: DbState = {
      domains: [{ name: 'example.com', dkimSelector: 'mail', dkimPublicKey: 'BBB' }],
      mailboxes: [],
      aliases: [],
    };
    const conflict = find(diff(onlyDms, db), 'dkim', 'example.com');
    expect(conflict?.divergence).toBe('field_conflict');
    expect(conflict?.availableResolutions).toEqual(['field_pick', 'skip']);
  });

  it('produces a stable stateHash for identical inputs', () => {
    const dms: DmsState = { ...emptyDms, domains: ['x.com'] };
    const a = diff(dms, emptyDb);
    const b = diff(dms, emptyDb);
    expect(a[0]?.stateHash).toBe(b[0]?.stateHash);
  });
});
