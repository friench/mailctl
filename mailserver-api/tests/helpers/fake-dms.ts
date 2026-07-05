import type {
  DmsAlias,
  DmsClient,
  DmsDkim,
  DmsEmail,
  DmsQuota,
  JunkMessage,
} from '../../src/domain/mailboxes/dms-client';
import type { AccessConfigFiles } from '../../src/lib/access-rules';

interface DkimEntry {
  selector: string;
  keysize: 2048 | 4096;
  publicKey: string;
}

/** In-memory DmsClient for tests. Use `errors` to simulate failures. */
export class FakeDmsClient implements DmsClient {
  public emails = new Map<string, string>();
  public quotas = new Map<string, number>();
  public dkim = new Map<string, DkimEntry>();
  public aliases = new Map<string, string>();
  public sendRestricted = new Set<string>();
  public receiveRestricted = new Set<string>();
  public sieve = new Map<string, string>();
  /** Per-address spam/Junk folder contents. Seed directly in tests. */
  public junk = new Map<string, JunkMessage[]>();
  /** Last allow/deny-list config written via {@link writeAccessConfig}. */
  public accessConfig: AccessConfigFiles | null = null;
  public calls: Array<{ method: string; args: unknown[] }> = [];
  public errors: Partial<Record<keyof DmsClient, Error>> = {};

  async listEmails(): Promise<DmsEmail[]> {
    this.calls.push({ method: 'listEmails', args: [] });
    if (this.errors.listEmails) throw this.errors.listEmails;
    return [...this.emails.keys()].map((address) => ({ address }));
  }

  async addEmail(address: string, password: string): Promise<void> {
    this.calls.push({ method: 'addEmail', args: [address, password] });
    if (this.errors.addEmail) throw this.errors.addEmail;
    if (this.emails.has(address)) throw new Error(`already exists: ${address}`);
    this.emails.set(address, password);
  }

  async updatePassword(address: string, password: string): Promise<void> {
    this.calls.push({ method: 'updatePassword', args: [address, password] });
    if (this.errors.updatePassword) throw this.errors.updatePassword;
    if (!this.emails.has(address)) throw new Error(`not found: ${address}`);
    this.emails.set(address, password);
  }

  async deleteEmail(address: string): Promise<void> {
    this.calls.push({ method: 'deleteEmail', args: [address] });
    if (this.errors.deleteEmail) throw this.errors.deleteEmail;
    this.emails.delete(address);
    this.quotas.delete(address);
  }

  async setQuota(address: string, megabytes: number): Promise<void> {
    this.calls.push({ method: 'setQuota', args: [address, megabytes] });
    if (this.errors.setQuota) throw this.errors.setQuota;
    this.quotas.set(address, megabytes);
  }

  async deleteQuota(address: string): Promise<void> {
    this.calls.push({ method: 'deleteQuota', args: [address] });
    if (this.errors.deleteQuota) throw this.errors.deleteQuota;
    this.quotas.delete(address);
  }

  async setSendRestricted(address: string, restricted: boolean): Promise<void> {
    this.calls.push({ method: 'setSendRestricted', args: [address, restricted] });
    if (this.errors.setSendRestricted) throw this.errors.setSendRestricted;
    if (restricted) this.sendRestricted.add(address);
    else this.sendRestricted.delete(address);
  }

  async setReceiveRestricted(address: string, restricted: boolean): Promise<void> {
    this.calls.push({ method: 'setReceiveRestricted', args: [address, restricted] });
    if (this.errors.setReceiveRestricted) throw this.errors.setReceiveRestricted;
    if (restricted) this.receiveRestricted.add(address);
    else this.receiveRestricted.delete(address);
  }

  async writeSieve(address: string, script: string): Promise<void> {
    this.calls.push({ method: 'writeSieve', args: [address, script] });
    if (this.errors.writeSieve) throw this.errors.writeSieve;
    if (script) this.sieve.set(address, script);
    else this.sieve.delete(address);
  }

  async listJunk(address: string): Promise<JunkMessage[]> {
    this.calls.push({ method: 'listJunk', args: [address] });
    if (this.errors.listJunk) throw this.errors.listJunk;
    return [...(this.junk.get(address) ?? [])];
  }

  async readJunkMessage(address: string, uid: number): Promise<string> {
    this.calls.push({ method: 'readJunkMessage', args: [address, uid] });
    if (this.errors.readJunkMessage) throw this.errors.readJunkMessage;
    const msg = (this.junk.get(address) ?? []).find((m) => m.uid === uid);
    if (!msg) throw new Error(`not found: uid ${uid}`);
    return `From: ${msg.from}\nSubject: ${msg.subject}\n\n[body of uid ${uid}]`;
  }

  async releaseJunk(address: string, uid: number): Promise<void> {
    this.calls.push({ method: 'releaseJunk', args: [address, uid] });
    if (this.errors.releaseJunk) throw this.errors.releaseJunk;
    this.junk.set(
      address,
      (this.junk.get(address) ?? []).filter((m) => m.uid !== uid),
    );
  }

  async deleteJunk(address: string, uid: number): Promise<void> {
    this.calls.push({ method: 'deleteJunk', args: [address, uid] });
    if (this.errors.deleteJunk) throw this.errors.deleteJunk;
    this.junk.set(
      address,
      (this.junk.get(address) ?? []).filter((m) => m.uid !== uid),
    );
  }

  async purgeJunkOlderThan(address: string, days: number): Promise<number> {
    this.calls.push({ method: 'purgeJunkOlderThan', args: [address, days] });
    if (this.errors.purgeJunkOlderThan) throw this.errors.purgeJunkOlderThan;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const current = this.junk.get(address) ?? [];
    const kept = current.filter((m) => new Date(m.date).getTime() >= cutoff);
    this.junk.set(address, kept);
    return current.length - kept.length;
  }

  async writeAccessConfig(files: AccessConfigFiles): Promise<void> {
    this.calls.push({ method: 'writeAccessConfig', args: [files] });
    if (this.errors.writeAccessConfig) throw this.errors.writeAccessConfig;
    this.accessConfig = files;
  }

  async generateDkim(domain: string, selector: string, keysize: 2048 | 4096): Promise<void> {
    this.calls.push({ method: 'generateDkim', args: [domain, selector, keysize] });
    if (this.errors.generateDkim) throw this.errors.generateDkim;
    const fakeKey = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA-fake-${domain}-${selector}-${keysize}`;
    this.dkim.set(domain, { selector, keysize, publicKey: fakeKey });
  }

  async readDkimPublicKey(domain: string, selector: string): Promise<string> {
    this.calls.push({ method: 'readDkimPublicKey', args: [domain, selector] });
    if (this.errors.readDkimPublicKey) throw this.errors.readDkimPublicKey;
    const entry = this.dkim.get(domain);
    if (!entry || entry.selector !== selector) {
      throw new Error(`DKIM key not found for ${domain} (selector=${selector})`);
    }
    return entry.publicKey;
  }

  async listAliases(): Promise<DmsAlias[]> {
    this.calls.push({ method: 'listAliases', args: [] });
    if (this.errors.listAliases) throw this.errors.listAliases;
    return [...this.aliases.entries()].map(([address, target]) => ({ address, target }));
  }

  async addAlias(address: string, target: string): Promise<void> {
    this.calls.push({ method: 'addAlias', args: [address, target] });
    if (this.errors.addAlias) throw this.errors.addAlias;
    this.aliases.set(address, target);
  }

  async deleteAlias(address: string, target: string): Promise<void> {
    this.calls.push({ method: 'deleteAlias', args: [address, target] });
    if (this.errors.deleteAlias) throw this.errors.deleteAlias;
    this.aliases.delete(address);
  }

  async listQuotas(): Promise<DmsQuota[]> {
    this.calls.push({ method: 'listQuotas', args: [] });
    if (this.errors.listQuotas) throw this.errors.listQuotas;
    return [...this.quotas.entries()].map(([address, quotaMb]) => ({ address, quotaMb }));
  }

  async listDkim(): Promise<DmsDkim[]> {
    this.calls.push({ method: 'listDkim', args: [] });
    if (this.errors.listDkim) throw this.errors.listDkim;
    return [...this.dkim.entries()].map(([domain, entry]) => ({
      domain,
      selector: entry.selector,
      publicKey: entry.publicKey,
    }));
  }
}
