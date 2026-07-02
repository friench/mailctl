import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Logger } from '../logger';

const DEFAULT_FOLDER = './drizzle';

function hasMigrations(folder: string): boolean {
  return existsSync(folder) && readdirSync(folder).some((f) => f.endsWith('.sql'));
}

/** Apply migrations on an existing better-sqlite3 connection (used in tests). */
export function migrateDatabase(
  sqlite: Database.Database,
  options: { logger?: Logger; folder?: string } = {},
): void {
  const folder = resolve(options.folder ?? DEFAULT_FOLDER);
  if (!hasMigrations(folder)) {
    options.logger?.info({ folder }, 'No migrations to apply');
    return;
  }
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: folder });
  options.logger?.info('Migrations applied');
}

/** Open a temp connection, apply migrations, close. Used at startup before main connection. */
export function runMigrations(databaseUrl: string, logger?: Logger): void {
  const isMemory = databaseUrl === ':memory:';
  const dbPath = isMemory ? databaseUrl : resolve(databaseUrl);

  if (!isMemory) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const folder = resolve(DEFAULT_FOLDER);
  if (!hasMigrations(folder)) {
    logger?.info({ folder }, 'No migrations to apply');
    return;
  }

  const sqlite = new Database(dbPath);
  if (!isMemory) {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');

  try {
    migrateDatabase(sqlite, { logger, folder });
  } finally {
    sqlite.close();
  }
}

if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL ?? './data/data.db';
  runMigrations(databaseUrl);
  // eslint-disable-next-line no-console
  console.log('Migrations done');
}
