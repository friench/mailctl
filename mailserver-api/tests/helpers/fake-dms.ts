import type {
  DmsAlias,
  DmsClient,
  DmsDkim,
  DmsEmail,
  DmsQuota,
} from '../../src/domain/mailboxes/dms-client';

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
