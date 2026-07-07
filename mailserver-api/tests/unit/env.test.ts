import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadEnv } from '../../src/env';

const VALID_BASE = {
  SESSION_SECRET: 'a'.repeat(64),
} as NodeJS.ProcessEnv;

describe('loadEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses minimal env with all defaults', () => {
    const env = loadEnv({ ...VALID_BASE });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3050);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DATABASE_URL).toBe('./data/data.db');
    expect(env.DMS_CONTAINER_NAME).toBe('mailserver');
    expect(env.SESSION_SECRET).toBe(VALID_BASE.SESSION_SECRET);
  });

  it('coerces PORT string to number', () => {
    const env = loadEnv({ ...VALID_BASE, PORT: '8080' });
    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('exits when SESSION_SECRET is missing', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits when SESSION_SECRET is too short', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => loadEnv({ SESSION_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits on invalid LOG_LEVEL', () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => loadEnv({ ...VALID_BASE, LOG_LEVEL: 'verbose' })).toThrow('exit');
  });

  it('exits on non-numeric PORT', () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => loadEnv({ ...VALID_BASE, PORT: 'abc' })).toThrow('exit');
  });

  it('accepts custom DATABASE_URL', () => {
    const env = loadEnv({ ...VALID_BASE, DATABASE_URL: '/var/lib/data.db' });
    expect(env.DATABASE_URL).toBe('/var/lib/data.db');
  });

  it('parses OIDC boolean flags without inverting "false"', () => {
    // Regression: z.coerce.boolean() treats the string "false" as true.
    const disabled = loadEnv({
      ...VALID_BASE,
      OIDC_AUTO_PROVISION: 'false',
      OIDC_REQUIRE_VERIFIED_EMAIL: 'false',
    });
    expect(disabled.OIDC_AUTO_PROVISION).toBe(false);
    expect(disabled.OIDC_REQUIRE_VERIFIED_EMAIL).toBe(false);

    const enabled = loadEnv({ ...VALID_BASE, OIDC_AUTO_PROVISION: 'true' });
    expect(enabled.OIDC_AUTO_PROVISION).toBe(true);

    // Defaults preserved when unset.
    const defaults = loadEnv({ ...VALID_BASE });
    expect(defaults.OIDC_AUTO_PROVISION).toBe(false);
    expect(defaults.OIDC_REQUIRE_VERIFIED_EMAIL).toBe(true);
  });

  it('rejects a non-boolean OIDC flag value', () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => loadEnv({ ...VALID_BASE, OIDC_AUTO_PROVISION: 'yes' })).toThrow('exit');
  });
});
