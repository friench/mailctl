import type { SieveRule } from '../db/schema';

export interface Vacation {
  enabled: boolean;
  subject: string;
  message: string;
  days: number;
}

export interface SieveConfig {
  vacation: Vacation;
  rules: SieveRule[];
}

/** Quote + escape a string for a Sieve double-quoted literal. */
function q(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const HEADER: Record<SieveRule['field'], string> = {
  from: 'From',
  to: 'To',
  subject: 'Subject',
};

/**
 * Compile a mailbox's structured filter rules + vacation autoresponder into a
 * Sieve script. Returns an empty string when there is nothing to apply.
 */
export function buildSieveScript(config: SieveConfig): string {
  const requires = new Set<string>();
  const blocks: string[] = [];

  for (const rule of config.rules) {
    if (!rule.contains.trim()) continue;
    let action: string;
    if (rule.action === 'fileinto') {
      requires.add('fileinto');
      action = `  fileinto ${q(rule.arg ?? 'INBOX')};`;
    } else if (rule.action === 'redirect') {
      action = `  redirect ${q(rule.arg ?? '')};`;
    } else {
      action = '  discard;\n  stop;';
    }
    blocks.push(`if header :contains ${q(HEADER[rule.field])} ${q(rule.contains)} {\n${action}\n}`);
  }

  if (config.vacation.enabled) {
    requires.add('vacation');
    const days = Math.max(1, Math.min(Math.trunc(config.vacation.days) || 7, 365));
    const subject = config.vacation.subject ? ` :subject ${q(config.vacation.subject)}` : '';
    blocks.push(`vacation :days ${days}${subject} ${q(config.vacation.message)};`);
  }

  if (blocks.length === 0) return '';
  const header = requires.size ? `require [${[...requires].map(q).join(', ')}];\n\n` : '';
  return `${header}${blocks.join('\n\n')}\n`;
}
