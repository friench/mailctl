import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupService } from '../../src/domain/backups/service';
import { createLogger } from '../../src/logger';

const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

describe('BackupService', () => {
  let tmp: string;
  let db: Database.Database;
  let backupDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'backup-test-'));
    backupDir = join(tmp, 'backups');
    db = new Database(join(tmp, 'source.db'));
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('hello');
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
    vi.useRealTimers();
  });

  function makeService(keep = 7): BackupService {
    return new BackupService(db, { dir: backupDir, keep, logger });
  }

  it('creates the dir, writes a backup file, and reports it (no S3)', async () => {
    const svc = makeService();
    const result = await svc.runBackup();

    expect(result.filename).toMatch(/^data-.*\.db$/);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.uploadedToS3).toBe(false);
    expect(svc.s3Configured).toBe(false);

    const list = await svc.listBackups();
    expect(list).toHaveLength(1);
    expect(list[0]?.filename).toBe(result.filename);
    expect(list[0]?.sizeBytes).toBe(result.sizeBytes);
    expect(list[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('listBackups returns [] when the dir does not exist yet', async () => {
    const svc = makeService();
    expect(await svc.listBackups()).toEqual([]);
  });

  it('rotation keeps only the newest `keep` backups', async () => {
    // Fake only Date so filenames (timestamp-derived) are distinct and ordered;
    // real timers keep better-sqlite3's async backup working.
    vi.useFakeTimers({ toFake: ['Date'] });
    const svc = makeService(2);

    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
      const { filename } = await svc.runBackup();
      created.push(filename);
    }

    const list = await svc.listBackups();
    expect(list).toHaveLength(2);

    // The two newest (last created) survive; older ones are pruned.
    const kept = list.map((x) => x.filename).sort();
    expect(kept).toEqual(created.slice(3).sort());
  });
});
