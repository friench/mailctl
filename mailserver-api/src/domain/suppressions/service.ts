import { BusinessError } from '../../lib/errors';
import type { Logger } from '../../logger';
import type { SuppressionReason, SuppressionRow } from '../../db/schema';
import type { SuppressionRepository } from './repository';

/** `"Name <a@b.com>"` / `" A@B.com "` → `a@b.com`. */
export function normalizeAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1]! : raw).trim().toLowerCase();
}

export interface AddSuppression {
  address: string;
  reason?: SuppressionReason;
  note?: string | null;
}

/**
 * Manages the recipient suppression list. `POST /send` consults
 * {@link filterSuppressed} to block delivery to suppressed addresses; hard
 * bounces auto-populate it via {@link addFromBounce}.
 */
export class SuppressionService {
  constructor(
    private readonly repo: SuppressionRepository,
    private readonly logger: Logger,
  ) {}

  list(): SuppressionRow[] {
    return this.repo.list();
  }

  add(input: AddSuppression): SuppressionRow {
    const address = normalizeAddress(input.address);
    if (!address.includes('@')) throw new BusinessError(400, 'Invalid address');
    return this.repo.upsert({
      address,
      reason: input.reason ?? 'manual',
      source: 'manual',
      note: input.note ?? null,
    });
  }

  /** Auto-suppress a recipient that hard-bounced (idempotent). */
  addFromBounce(address: string, bounceId: string): void {
    this.repo.upsert({
      address: normalizeAddress(address),
      reason: 'hard_bounce',
      source: bounceId,
    });
    this.logger.info({ address, bounceId }, 'Address suppressed from hard bounce');
  }

  remove(id: string): void {
    if (!this.repo.delete(id)) throw new BusinessError(404, 'Suppression not found');
  }

  /** Return the subset of `recipients` (any format) that are suppressed. */
  filterSuppressed(recipients: string[]): SuppressionRow[] {
    const normalized = [...new Set(recipients.map(normalizeAddress))];
    return this.repo.findSuppressed(normalized);
  }
}
