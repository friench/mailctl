/* eslint-disable no-console */
import { loadEnv } from '../env';
import { createDb } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { ApiKeyRepository } from '../domain/apikeys/repository';
import { ApiKeyService } from '../domain/apikeys/service';

interface ParsedArgs {
  name?: string;
  scopes?: string[];
  expiresInDays?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (!arg.startsWith('--')) continue;

    const eqIdx = arg.indexOf('=');
    const key = eqIdx > -1 ? arg.slice(2, eqIdx) : arg.slice(2);
    const value = eqIdx > -1 ? arg.slice(eqIdx + 1) : (argv[++i] ?? '');

    switch (key) {
      case 'name':
        result.name = value;
        break;
      case 'scope':
      case 'scopes':
        result.scopes = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case 'expires-in-days':
        result.expiresInDays = Number.parseInt(value, 10);
        break;
      default:
        console.error(`Unknown argument: --${key}`);
        process.exit(2);
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (!args.name) {
  console.error(
    'Usage: pnpm create-api-key --name="My Key" [--scopes=send,admin] [--expires-in-days=30]',
  );
  process.exit(2);
}

const env = loadEnv();
const client = createDb(env.DATABASE_URL);
try {
  migrateDatabase(client.sqlite);

  const repo = new ApiKeyRepository(client.db);
  const service = new ApiKeyService(repo);

  const expiresAt =
    args.expiresInDays !== undefined
      ? new Date(Date.now() + args.expiresInDays * 86_400_000)
      : null;

  const created = service.generateAndStore(args.name, {
    scopes: args.scopes,
    expiresAt,
  });

  console.log('');
  console.log('  ✓ API key created');
  console.log('');
  console.log(`    Name:    ${created.name}`);
  console.log(`    ID:      ${created.id}`);
  console.log(`    Prefix:  ${created.prefix}`);
  console.log(`    Scopes:  ${created.scopes.length > 0 ? created.scopes.join(', ') : '(none)'}`);
  console.log(`    Expires: ${created.expiresAt ? created.expiresAt.toISOString() : 'never'}`);
  console.log('');
  console.log('    Plain key (save now — not shown again):');
  console.log('');
  console.log(`    ${created.plain}`);
  console.log('');
} finally {
  client.close();
}
