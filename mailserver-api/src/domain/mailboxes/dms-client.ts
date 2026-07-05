/** Minimal interface to docker-mailserver's `setup` CLI. Mockable for tests. */
export interface DmsClient {
  listEmails(): Promise<DmsEmail[]>;
  addEmail(address: string, password: string): Promise<void>;
  updatePassword(address: string, password: string): Promise<void>;
  deleteEmail(address: string): Promise<void>;
  setQuota(address: string, megabytes: number): Promise<void>;
  deleteQuota(address: string): Promise<void>;
  /** Block/unblock outbound mail for an address (docker-mailserver `email restrict … send`). */
  setSendRestricted(address: string, restricted: boolean): Promise<void>;
  /** Block/unblock inbound mail for an address (docker-mailserver `email restrict … receive`). */
  setReceiveRestricted(address: string, restricted: boolean): Promise<void>;
  /** Install the active per-user Sieve script (`~/.dovecot.sieve`) for an address. */
  writeSieve(address: string, script: string): Promise<void>;
  // Spam quarantine — the mailbox's Junk folder, managed via Dovecot (`doveadm`).
  /** List the messages currently in an address's spam/Junk folder. */
  listJunk(address: string): Promise<JunkMessage[]>;
  /** Fetch the raw (headers + body) text of one quarantined message. */
  readJunkMessage(address: string, uid: number): Promise<string>;
  /** Release a quarantined message back to the inbox (move Junk → INBOX). */
  releaseJunk(address: string, uid: number): Promise<void>;
  /** Permanently delete (expunge) a quarantined message. */
  deleteJunk(address: string, uid: number): Promise<void>;
  /** Expunge Junk messages saved more than `days` ago; returns the count removed. */
  purgeJunkOlderThan(address: string, days: number): Promise<number>;
  generateDkim(domain: string, selector: string, keysize: 2048 | 4096): Promise<void>;
  readDkimPublicKey(domain: string, selector: string): Promise<string>;
  // Read-only enumeration used by the DMS↔DB reconciliation feature.
  listAliases(): Promise<DmsAlias[]>;
  addAlias(address: string, target: string): Promise<void>;
  deleteAlias(address: string, target: string): Promise<void>;
  listQuotas(): Promise<DmsQuota[]>;
  listDkim(): Promise<DmsDkim[]>;
}

export interface DmsEmail {
  address: string;
}

/** One message in a mailbox's spam/Junk folder, as reported by `doveadm fetch`. */
export interface JunkMessage {
  /** Dovecot UID — stable within the folder; used to release/delete the message. */
  uid: number;
  /** Dovecot GUID (globally unique message id). */
  guid: string;
  from: string;
  subject: string;
  /** Received date, as reported by Dovecot (e.g. `2026-07-01 12:34:56`). */
  date: string;
  sizeBytes: number | null;
  /** Spam score parsed from `X-Spam-Score`, when the engine set one. */
  score: number | null;
}

export interface DmsAlias {
  address: string;
  target: string;
}

export interface DmsQuota {
  address: string;
  quotaMb: number;
}

export interface DmsDkim {
  domain: string;
  selector: string;
  publicKey: string;
}
