import { describe, it, expect } from 'vitest';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import type { JunkMessage } from '../../src/domain/mailboxes/dms-client';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function msg(uid: number, date: string): JunkMessage {
  return { uid, guid: `g${uid}`, from: 'x@y', subject: 's', date, sizeBytes: 1, score: 5 };
}

describe('QuarantineService.purge', () => {
  let h: TestDbHandle;

  it('expunges only messages older than the retention window, across mailboxes', async () => {
    h = createTestDb();
    try {
      h.domainRepo.create({ name: 'example.org', active: true });
      const a = await h.mailboxService.create({
        address: 'a@example.org',
        password: 'InitPass123',
      });
      const b = await h.mailboxService.create({
        address: 'b@example.org',
        password: 'InitPass123',
      });
      h.dms.junk.set('a@example.org', [msg(1, isoDaysAgo(40)), msg(2, isoDaysAgo(5))]);
      h.dms.junk.set('b@example.org', [msg(3, isoDaysAgo(90))]);

      const removed = await h.quarantineService.purge(
        [h.mailboxRepo.findById(a.id)!, h.mailboxRepo.findById(b.id)!],
        30,
      );

      expect(removed).toBe(2);
      expect(h.dms.junk.get('a@example.org')!.map((m) => m.uid)).toEqual([2]);
      expect(h.dms.junk.get('b@example.org')).toEqual([]);
    } finally {
      h.close();
    }
  });
});
