import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { FeatureFlagService } from '../../src/domain/feature-flags/service';

describe('FeatureFlagService', () => {
  let h: TestDbHandle;
  beforeEach(() => (h = createTestDb()));
  afterEach(() => h.close());

  it('returns the registry default for an unknown-state flag', () => {
    expect(h.featureFlagService.isEnabled('webhooks_enabled')).toBe(true);
    expect(h.featureFlagService.isEnabled('queue_enabled')).toBe(true);
    expect(h.featureFlagService.isEnabled('auto_dkim_enabled')).toBe(false);
  });

  it('returns false for completely unknown keys', () => {
    expect(h.featureFlagService.isEnabled('totally_made_up')).toBe(false);
  });

  it('overrides default when DB row is set', () => {
    h.featureFlagService.setEnabled('webhooks_enabled', false);
    expect(h.featureFlagService.isEnabled('webhooks_enabled')).toBe(false);

    h.featureFlagService.setEnabled('webhooks_enabled', true);
    expect(h.featureFlagService.isEnabled('webhooks_enabled')).toBe(true);
  });

  it('rejects setEnabled for unknown keys', () => {
    expect(() => h.featureFlagService.setEnabled('totally_made_up', true)).toThrow(
      /Unknown feature flag/,
    );
  });

  it('reset() removes the override and returns the default', () => {
    h.featureFlagService.setEnabled('webhooks_enabled', false);
    expect(h.featureFlagService.isEnabled('webhooks_enabled')).toBe(false);

    const reset = h.featureFlagService.reset('webhooks_enabled');
    expect(reset.enabled).toBe(true);
    expect(reset.override).toBe(false);
    expect(h.featureFlagService.isEnabled('webhooks_enabled')).toBe(true);
  });

  it('list() merges registry defaults with DB overrides', () => {
    h.featureFlagService.setEnabled('webhooks_enabled', false);
    const list = h.featureFlagService.list();

    const webhooks = list.find((f) => f.key === 'webhooks_enabled');
    expect(webhooks).toEqual(
      expect.objectContaining({
        key: 'webhooks_enabled',
        enabled: false,
        defaultValue: true,
        override: true,
      }),
    );
    expect(webhooks?.updatedAt).toBeInstanceOf(Date);

    const auto = list.find((f) => f.key === 'auto_dkim_enabled');
    expect(auto).toEqual(
      expect.objectContaining({
        enabled: false,
        defaultValue: false,
        override: false,
        updatedAt: null,
      }),
    );
  });

  it('caches results within TTL window', () => {
    const repo = h.featureFlagRepo;
    const findSpy = vi.spyOn(repo, 'findByKey');
    // Use a long TTL for this test
    const cached = new FeatureFlagService(repo, 60_000);

    expect(cached.isEnabled('webhooks_enabled')).toBe(true);
    expect(cached.isEnabled('webhooks_enabled')).toBe(true);
    expect(cached.isEnabled('webhooks_enabled')).toBe(true);

    expect(findSpy).toHaveBeenCalledTimes(1);
  });

  it('setEnabled invalidates the cache', () => {
    const cached = new FeatureFlagService(h.featureFlagRepo, 60_000);
    expect(cached.isEnabled('webhooks_enabled')).toBe(true); // populates cache

    cached.setEnabled('webhooks_enabled', false);
    expect(cached.isEnabled('webhooks_enabled')).toBe(false);
  });

  it('reset() invalidates the cache', () => {
    const cached = new FeatureFlagService(h.featureFlagRepo, 60_000);
    cached.setEnabled('webhooks_enabled', false);
    expect(cached.isEnabled('webhooks_enabled')).toBe(false);

    cached.reset('webhooks_enabled');
    expect(cached.isEnabled('webhooks_enabled')).toBe(true);
  });
});
