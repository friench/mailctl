import { generateApiKey, parseApiKey, verifyApiKey } from '../../lib/crypto';
import type { ApiKeyRow } from '../../db/schema';
import type { ApiKeyRepository } from './repository';

export type VerificationFailureReason =
  | 'malformed'
  | 'not_found'
  | 'revoked'
  | 'expired'
  | 'mismatch';

export type VerificationResult =
  | { ok: true; apiKey: ApiKeyRow }
  | { ok: false; reason: VerificationFailureReason };

export interface CreatedApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  /** Plain text key — shown only on creation, never returned again. */
  plain: string;
}

export interface CreateOptions {
  scopes?: string[];
  expiresAt?: Date | null;
  createdByUserId?: string | null;
}

export class ApiKeyService {
  constructor(private readonly repo: ApiKeyRepository) {}

  generateAndStore(name: string, options: CreateOptions = {}): CreatedApiKey {
    const { plain, prefix, hash } = generateApiKey();
    const row = this.repo.create({
      name,
      hash,
      prefix,
      scopes: options.scopes,
      expiresAt: options.expiresAt ?? null,
      createdByUserId: options.createdByUserId ?? null,
    });

    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
      plain,
    };
  }

  verify(input: unknown, now: Date = new Date()): VerificationResult {
    const parsed = parseApiKey(input);
    if (!parsed) return { ok: false, reason: 'malformed' };

    const row = this.repo.findByPrefix(parsed.prefix);
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.revokedAt) return { ok: false, reason: 'revoked' };
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: 'expired' };
    }
    if (!verifyApiKey(input as string, row.hash)) {
      return { ok: false, reason: 'mismatch' };
    }
    return { ok: true, apiKey: row };
  }

  touchLastUsed(id: string): void {
    this.repo.touchLastUsed(id);
  }

  revoke(id: string): void {
    this.repo.revoke(id);
  }

  list(): ApiKeyRow[] {
    return this.repo.list();
  }
}
