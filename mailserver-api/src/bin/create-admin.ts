/* eslint-disable no-console */
import { loadEnv } from '../env';
import { createDb } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { UserRepository } from '../domain/users/repository';
import { UserService } from '../domain/users/service';

interface ParsedArgs {
  email?: string;
  password?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || !arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const key = eq > -1 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq > -1 ? arg.slice(eq + 1) : (argv[++i] ?? '');
    if (key === 'email') result.email = value;
    else if (key === 'password') result.password = value;
    else {
      console.error(`Unknown argument: --${key}`);
      process.exit(2);
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password) {
    console.error('Usage: pnpm create-admin --email=admin@example.com --password=<min-8-chars>');
    process.exit(2);
  }

  const env = loadEnv();
  const client = createDb(env.DATABASE_URL);
  try {
    migrateDatabase(client.sqlite);
    const repo = new UserRepository(client.db);
    const service = new UserService(repo);
    const user = await service.create(args.email, args.password);
    console.log('');
    console.log('  ✓ Admin user created');
    console.log(`    ID:    ${user.id}`);
    console.log(`    Email: ${user.email}`);
    console.log('');
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
