import { BusinessError } from '../../lib/errors';
import type { Logger } from '../../logger';
import {
  normalizeRecipient,
  normalizeValue,
  renderAccessConfig,
  AccessRuleError,
  type AccessRuleInput,
} from '../../lib/access-rules';
import type { AccessAction, AccessMatchType, AccessRuleRow } from '../../db/schema';
import type { DmsClient } from '../mailboxes/dms-client';
import type { AccessRuleRepository } from './repository';

export interface CreateAccessRule {
  matchType: AccessMatchType;
  action: AccessAction;
  value: string;
  recipient?: string | null;
  note?: string | null;
}

/**
 * Manages allow/deny-list rules and reflects them into docker-mailserver. Every
 * mutation regenerates the full enforcement config (Postfix access maps +
 * Rspamd multimaps/Lua) and writes it into DMS.
 */
export class AccessListService {
  constructor(
    private readonly repo: AccessRuleRepository,
    private readonly dms: DmsClient,
    private readonly logger: Logger,
  ) {}

  list(): AccessRuleRow[] {
    return this.repo.list();
  }

  async create(input: CreateAccessRule): Promise<AccessRuleRow> {
    let value: string;
    let recipient: string | null;
    try {
      value = normalizeValue(input.matchType, input.value);
      recipient = normalizeRecipient(input.recipient);
    } catch (err) {
      if (err instanceof AccessRuleError) throw new BusinessError(400, err.message);
      throw err;
    }

    if (this.repo.findDuplicate(input.matchType, value, recipient)) {
      throw new BusinessError(409, 'A rule for this value and scope already exists');
    }

    const row = this.repo.create({
      matchType: input.matchType,
      action: input.action,
      value,
      recipient,
      note: input.note ?? null,
    });
    await this.regenerate();
    return row;
  }

  async delete(id: string): Promise<void> {
    if (!this.repo.delete(id)) throw new BusinessError(404, 'Rule not found');
    await this.regenerate();
  }

  /** Re-render the full rule set and write it into DMS. */
  async regenerate(): Promise<void> {
    const rules: AccessRuleInput[] = this.repo.list().map((r) => ({
      matchType: r.matchType,
      action: r.action,
      value: r.value,
      recipient: r.recipient,
    }));
    await this.dms.writeAccessConfig(renderAccessConfig(rules));
    this.logger.info({ count: rules.length }, 'Access-list config regenerated');
  }
}
