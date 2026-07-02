import { createHash } from 'node:crypto';
import type { DbState, DmsState, Divergence, ReconciliationItem, Resolution } from './types';

function stateHash(dmsState: unknown, dbState: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ dmsState, dbState }))
    .digest('hex')
    .slice(0, 16);
}

function makeItem(
  entityType: ReconciliationItem['entityType'],
  key: string,
  divergence: Divergence,
  dmsState: Record<string, unknown> | null,
  dbState: Record<string, unknown> | null,
  availableResolutions: Resolution[],
  suggestedResolution: Resolution,
): ReconciliationItem {
  return {
    entityType,
    key,
    divergence,
    dmsState,
    dbState,
    availableResolutions,
    suggestedResolution,
    stateHash: stateHash(dmsState, dbState),
  };
}

/**
 * Pure two-way diff of DMS vs panel DB state → reviewable reconciliation items.
 * No I/O; deterministic; the single unit-testable core of the sync feature.
 */
export function diff(dms: DmsState, db: DbState): ReconciliationItem[] {
  const items: ReconciliationItem[] = [];

  // ---- domains (presence only; DKIM handled separately) ----
  const dbDomainNames = new Set(db.domains.map((d) => d.name.toLowerCase()));
  const dmsDomainNames = new Set(dms.domains.map((d) => d.toLowerCase()));
  for (const name of dmsDomainNames) {
    if (!dbDomainNames.has(name)) {
      items.push(
        makeItem('domain', name, 'only_in_dms', { name }, null, ['import', 'skip'], 'import'),
      );
    }
  }
  for (const name of dbDomainNames) {
    if (!dmsDomainNames.has(name)) {
      items.push(
        makeItem('domain', name, 'only_in_db', null, { name }, ['delete_db', 'skip'], 'skip'),
      );
    }
  }

  // ---- mailboxes ----
  const dbMailboxes = new Map(db.mailboxes.map((m) => [m.address.toLowerCase(), m]));
  const dmsMailboxes = new Map(dms.mailboxes.map((m) => [m.address.toLowerCase(), m]));
  for (const [address, m] of dmsMailboxes) {
    const dbRow = dbMailboxes.get(address);
    if (!dbRow) {
      items.push(
        makeItem(
          'mailbox',
          address,
          'only_in_dms',
          m,
          null,
          ['import', 'delete_dms', 'skip'],
          'import',
        ),
      );
    } else if ((m.quotaMb ?? null) !== (dbRow.quotaMb ?? null)) {
      items.push(
        makeItem('mailbox', address, 'field_conflict', m, dbRow, ['field_pick', 'skip'], 'skip'),
      );
    }
  }
  for (const [address, m] of dbMailboxes) {
    if (!dmsMailboxes.has(address)) {
      items.push(
        makeItem('mailbox', address, 'only_in_db', null, m, ['push', 'delete_db', 'skip'], 'skip'),
      );
    }
  }

  // ---- aliases ----
  const dbAliases = new Map(db.aliases.map((a) => [a.address.toLowerCase(), a]));
  const dmsAliases = new Map(dms.aliases.map((a) => [a.address.toLowerCase(), a]));
  for (const [address, a] of dmsAliases) {
    const dbRow = dbAliases.get(address);
    if (!dbRow) {
      items.push(
        makeItem(
          'alias',
          address,
          'only_in_dms',
          a,
          null,
          ['import', 'delete_dms', 'skip'],
          'import',
        ),
      );
    } else if (a.target !== dbRow.target) {
      items.push(
        makeItem('alias', address, 'field_conflict', a, dbRow, ['field_pick', 'skip'], 'skip'),
      );
    }
  }
  for (const [address, a] of dbAliases) {
    if (!dmsAliases.has(address)) {
      items.push(
        makeItem('alias', address, 'only_in_db', null, a, ['push', 'delete_db', 'skip'], 'skip'),
      );
    }
  }

  // ---- dkim (DB side lives on the domain row) ----
  const dbDkim = new Map(
    db.domains
      .filter((d) => d.dkimSelector && d.dkimPublicKey)
      .map((d) => [
        d.name.toLowerCase(),
        { domain: d.name.toLowerCase(), selector: d.dkimSelector!, publicKey: d.dkimPublicKey! },
      ]),
  );
  const dmsDkim = new Map(
    dms.dkim.map((k) => [k.domain.toLowerCase(), { ...k, domain: k.domain.toLowerCase() }]),
  );
  for (const [domain, k] of dmsDkim) {
    const dbRow = dbDkim.get(domain);
    if (!dbRow) {
      items.push(makeItem('dkim', domain, 'only_in_dms', k, null, ['import', 'skip'], 'import'));
    } else if (k.publicKey !== dbRow.publicKey || k.selector !== dbRow.selector) {
      items.push(
        makeItem('dkim', domain, 'field_conflict', k, dbRow, ['field_pick', 'skip'], 'skip'),
      );
    }
  }
  for (const [domain, k] of dbDkim) {
    if (!dmsDkim.has(domain)) {
      // Cannot push/regenerate DKIM from here — surface, leave to the operator.
      items.push(makeItem('dkim', domain, 'only_in_db', null, k, ['skip'], 'skip'));
    }
  }

  return items;
}
