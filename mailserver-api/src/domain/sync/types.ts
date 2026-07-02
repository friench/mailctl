export type EntityType = 'domain' | 'mailbox' | 'alias' | 'dkim';
export type Divergence = 'only_in_dms' | 'only_in_db' | 'field_conflict';
export type Resolution = 'import' | 'push' | 'field_pick' | 'delete_db' | 'delete_dms' | 'skip';

/** One reviewable divergence between DMS and the panel DB. */
export interface ReconciliationItem {
  entityType: EntityType;
  /** Stable identity: domain name / mailbox+alias address / domain (for dkim). */
  key: string;
  divergence: Divergence;
  dmsState: Record<string, unknown> | null;
  dbState: Record<string, unknown> | null;
  availableResolutions: Resolution[];
  suggestedResolution: Resolution;
  /** sha256 over the item's both-sides state; lets `apply` detect a stale preview. */
  stateHash: string;
}

/** Canonical snapshot of the DMS side. `domains` is the derived union (see SyncService). */
export interface DmsState {
  domains: string[];
  mailboxes: Array<{ address: string; quotaMb: number | null }>;
  aliases: Array<{ address: string; target: string }>;
  dkim: Array<{ domain: string; selector: string; publicKey: string }>;
}

/** Canonical snapshot of the panel DB side. */
export interface DbState {
  domains: Array<{ name: string; dkimSelector: string | null; dkimPublicKey: string | null }>;
  mailboxes: Array<{ address: string; quotaMb: number | null }>;
  aliases: Array<{ address: string; target: string }>;
}

/** A resolution selected by the operator for one previewed item. */
export interface ResolutionRequest {
  entityType: EntityType;
  key: string;
  resolution: Resolution;
  stateHash: string;
  /** For `field_pick`: which side wins per field, e.g. `{ quota: 'dms' }`. */
  fields?: Record<string, 'dms' | 'db'>;
  /** For `push` of a mailbox: the password to create it in DMS with. */
  password?: string;
}

export type ApplyStatus = 'applied' | 'failed' | 'skipped' | 'rejected';

export interface ApplyItemResult {
  entityType: EntityType;
  key: string;
  resolution: Resolution;
  status: ApplyStatus;
  error?: string;
}

export interface SyncRunSummary {
  at: string;
  applied: number;
  failed: number;
  rejected: number;
}
