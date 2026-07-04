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
