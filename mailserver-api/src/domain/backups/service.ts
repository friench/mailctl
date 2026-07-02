import type BetterSqlite3 from 'better-sqlite3';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '../../logger';

const BACKUP_PREFIX = 'data-';
const BACKUP_SUFFIX = '.db';
const BACKUP_GLOB = /^data-.*\.db$/;

export interface BackupS3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

export interface BackupServiceOptions {
  dir: string;
  keep: number;
  s3?: BackupS3Config;
  logger: Logger;
}

export interface RunBackupResult {
  filename: string;
  sizeBytes: number;
  uploadedToS3: boolean;
}

export interface BackupListItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * Creates online (hot) backups of the panel SQLite database using better-sqlite3's
 * backup API, rotates old copies, and optionally mirrors the newest copy to S3.
 * Mail-data (Dovecot) is intentionally out of scope.
 */
export class BackupService {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly opts: BackupServiceOptions,
  ) {}

  /** True when S3 upload is fully configured (bucket + credentials present). */
  get s3Configured(): boolean {
    return !!this.opts.s3;
  }

  async runBackup(): Promise<RunBackupResult> {
    await mkdir(this.opts.dir, { recursive: true });

    const filename = `${BACKUP_PREFIX}${timestamp(new Date())}${BACKUP_SUFFIX}`;
    const fullPath = join(this.opts.dir, filename);

    await this.db.backup(fullPath);
    const { size: sizeBytes } = await stat(fullPath);

    await this.rotate();

    let uploadedToS3 = false;
    if (this.opts.s3) {
      uploadedToS3 = await this.uploadToS3(fullPath, filename, this.opts.s3);
    }

    this.opts.logger.info({ filename, sizeBytes, uploadedToS3 }, 'Backup created');
    return { filename, sizeBytes, uploadedToS3 };
  }

  async listBackups(): Promise<BackupListItem[]> {
    let names: string[];
    try {
      names = await readdir(this.opts.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const items: BackupListItem[] = [];
    for (const name of names) {
      if (!BACKUP_GLOB.test(name)) continue;
      const s = await stat(join(this.opts.dir, name));
      items.push({
        filename: name,
        sizeBytes: s.size,
        createdAt: s.mtime.toISOString(),
      });
    }
    // Newest first. Sort by filename: it encodes the creation timestamp and is
    // deterministic even when filesystem mtime resolution is coarse.
    items.sort((a, b) => b.filename.localeCompare(a.filename));
    return items;
  }

  /** Delete all but the newest `keep` backup files. */
  private async rotate(): Promise<void> {
    const items = await this.listBackups();
    const stale = items.slice(this.opts.keep);
    for (const item of stale) {
      try {
        await unlink(join(this.opts.dir, item.filename));
      } catch (err) {
        this.opts.logger.warn({ err, filename: item.filename }, 'Failed to delete stale backup');
      }
    }
  }

  private async uploadToS3(
    fullPath: string,
    filename: string,
    s3: BackupS3Config,
  ): Promise<boolean> {
    try {
      // Lazy-load so the SDK isn't required when S3 is unconfigured.
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        region: s3.region,
        ...(s3.endpoint ? { endpoint: s3.endpoint, forcePathStyle: true } : {}),
        credentials: {
          accessKeyId: s3.accessKeyId,
          secretAccessKey: s3.secretAccessKey,
        },
      });
      const key = `${s3.prefix}${filename}`;
      const { size } = await stat(fullPath);
      await client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: key,
          Body: createReadStream(fullPath),
          ContentLength: size,
          ContentType: 'application/octet-stream',
        }),
      );
      this.opts.logger.info({ bucket: s3.bucket, key }, 'Backup uploaded to S3');
      return true;
    } catch (err) {
      // A failed upload must not fail the local backup.
      this.opts.logger.warn({ err, filename }, 'S3 backup upload failed; local backup kept');
      return false;
    }
  }
}

/** Filesystem-safe ISO-ish timestamp, e.g. 2026-06-22T14-30-05-123Z. */
function timestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
