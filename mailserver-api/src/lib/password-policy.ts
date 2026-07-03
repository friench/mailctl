import { createHash } from 'node:crypto';

/** Returns an error message when the password is unacceptable, or null when OK. */
export interface PasswordValidator {
  validate(password: string): Promise<string | null>;
}

/** A small illustrative deny-list; the HIBP check catches the long tail. */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'qwerty123',
  'iloveyou',
  'welcome1',
  'admin123',
  'letmein123',
]);

export interface StrengthOptions {
  /** Minimum length. Defaults to 10. */
  minLength?: number;
}

/** Synchronous strength policy. Returns an error message or null. */
export function assessStrength(password: string, opts: StrengthOptions = {}): string | null {
  const minLength = opts.minLength ?? 10;
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters`;
  }
  if (/^(.)\1+$/.test(password)) {
    return 'Password must not be a single repeated character';
  }
  if (new Set(password).size < 4) {
    return 'Password must use at least 4 distinct characters';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Password is too common';
  }
  return null;
}

/** Given a 5-char SHA-1 prefix, returns the HIBP range response body. */
export type PwnedRangeLookup = (sha1Prefix: string) => Promise<string>;

const defaultLookup: PwnedRangeLookup = async (prefix) => {
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true' },
  });
  if (!res.ok) throw new Error(`HIBP responded ${res.status}`);
  return res.text();
};

export interface PwnedChecker {
  isBreached(password: string): Promise<boolean>;
}

/**
 * k-anonymity breached-password check against Have I Been Pwned: only the first
 * 5 chars of the SHA-1 hash leave the process. Fail-open — returns false on any
 * error so an HIBP outage never blocks provisioning.
 */
export function createPwnedChecker(lookup: PwnedRangeLookup = defaultLookup): PwnedChecker {
  return {
    async isBreached(password) {
      try {
        const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);
        const body = await lookup(prefix);
        return body.split('\n').some((line) => {
          const [hashSuffix, count] = line.trim().split(':');
          return hashSuffix === suffix && Number(count) > 0;
        });
      } catch {
        return false;
      }
    },
  };
}

export interface PolicyOptions extends StrengthOptions {
  /** Run the HIBP breached-password check. Defaults to true. */
  hibp?: boolean;
  /** Inject a checker (for tests). Defaults to the real HIBP checker. */
  pwnedChecker?: PwnedChecker;
}

/** Strength policy + optional breached-password rejection. */
export class PolicyPasswordValidator implements PasswordValidator {
  private readonly minLength: number | undefined;
  private readonly hibp: boolean;
  private readonly checker: PwnedChecker;

  constructor(opts: PolicyOptions = {}) {
    this.minLength = opts.minLength;
    this.hibp = opts.hibp ?? true;
    this.checker = opts.pwnedChecker ?? createPwnedChecker();
  }

  async validate(password: string): Promise<string | null> {
    const strength = assessStrength(password, { minLength: this.minLength });
    if (strength) return strength;
    if (this.hibp && (await this.checker.isBreached(password))) {
      return 'Password appears in a known data breach; choose a different one';
    }
    return null;
  }
}
