import type {
  MigrationParams,
  MigrationResult,
  Migrator,
} from '../../src/domain/migrations/migrator';

/** In-memory Migrator for tests. Configure the result; inspect recorded runs. */
export class FakeMigrator implements Migrator {
  public runs: MigrationParams[] = [];
  public result: MigrationResult = { ok: true, log: 'synced 3 mailboxes' };

  async run(params: MigrationParams): Promise<MigrationResult> {
    this.runs.push(params);
    return this.result;
  }
}
