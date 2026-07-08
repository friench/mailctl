import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The app version. `npm_package_version` is only set when launched via pnpm/npm
 * scripts; under `node dist/index.js` (Docker) it's unset, so fall back to
 * reading package.json next to the compiled output (dist/version.js → ../package.json).
 */
export function appVersion(): string {
  if (process.env.npm_package_version) return process.env.npm_package_version;
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
