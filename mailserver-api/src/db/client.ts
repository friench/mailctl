import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export interface DbClient {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
  close: () => void;
}

export function createDb(databaseUrl: string): DbClient {
  const isMemory = databaseUrl === ':memory:';
  const dbPath = isMemory ? databaseUrl : resolve(databaseUrl);

  if (!isMemory) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);

  if (!isMemory) {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('cache_size = -32000');
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

export type Db = DbClient['db'];
