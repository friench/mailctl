import { BusinessError } from '../../lib/errors';
import { findDefinition, FLAG_DEFINITIONS, KNOWN_FLAG_KEYS, type FlagDefinition } from './registry';
import type { FeatureFlagRepository } from './repository';

const DEFAULT_TTL_MS = 30_000;

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

export interface FlagView {
  key: string;
  enabled: boolean;
  defaultValue: boolean;
  description: string;
  updatedAt: Date | null;
  /** True if the value is currently overridden by a DB row, false if using default. */
  override: boolean;
}

export class FeatureFlagService {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly repo: FeatureFlagRepository,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  isEnabled(key: string): boolean {
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.enabled;

    const row = this.repo.findByKey(key);
    const def = findDefinition(key);
    const enabled = row ? row.enabled : (def?.default ?? false);

    this.cache.set(key, { enabled, expiresAt: now + this.ttlMs });
    return enabled;
  }

  /** Returns the full set of known flags merged with stored overrides. */
  list(): FlagView[] {
    const stored = new Map(this.repo.list().map((r) => [r.key, r]));
    return FLAG_DEFINITIONS.map((def: FlagDefinition) => {
      const row = stored.get(def.key);
      return {
        key: def.key,
        enabled: row?.enabled ?? def.default,
        defaultValue: def.default,
        description: def.description,
        updatedAt: row?.updatedAt ?? null,
        override: !!row,
      };
    });
  }

  setEnabled(key: string, enabled: boolean): FlagView {
    if (!KNOWN_FLAG_KEYS.has(key)) {
      throw new BusinessError(404, `Unknown feature flag: ${key}`);
    }
    const row = this.repo.upsert(key, enabled);
    this.cache.set(key, { enabled: row.enabled, expiresAt: Date.now() + this.ttlMs });

    const def = findDefinition(key)!;
    return {
      key,
      enabled: row.enabled,
      defaultValue: def.default,
      description: def.description,
      updatedAt: row.updatedAt,
      override: true,
    };
  }

  /** Delete the override; subsequent reads return the default. */
  reset(key: string): FlagView {
    if (!KNOWN_FLAG_KEYS.has(key)) {
      throw new BusinessError(404, `Unknown feature flag: ${key}`);
    }
    this.repo.delete(key);
    this.cache.delete(key);
    const def = findDefinition(key)!;
    return {
      key,
      enabled: def.default,
      defaultValue: def.default,
      description: def.description,
      updatedAt: null,
      override: false,
    };
  }

  invalidate(key?: string): void {
    if (key !== undefined) this.cache.delete(key);
    else this.cache.clear();
  }
}
