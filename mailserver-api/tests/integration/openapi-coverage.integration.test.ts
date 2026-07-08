import { describe, it, expect } from 'vitest';
import type { Express } from 'express';
import { createTestDb } from '../helpers/db';
import { createTestApp } from '../helpers/server';
import { buildOpenApiDocument } from '../../src/lib/openapi';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
// Clean REST paths only — excludes the SPA catch-all and admin-guard middleware
// layers, whose Express "paths" are regexes (contain ^ \ ( etc.).
const CLEAN_PATH = /^\/[A-Za-z0-9/_.:{}-]*$/;

/**
 * Routes deliberately kept out of the OpenAPI document. Each is a reviewed
 * exception, not an oversight:
 *  - mail-client autoconfig (Thunderbird/Outlook/Apple) — not part of the REST API
 *  - OIDC browser redirects — not a JSON API
 *  - Prometheus metrics — separate scrape endpoint
 */
const UNDOCUMENTED = new Set([
  'get /.well-known/autoconfig/mail/config-v1.1.xml',
  'get /mail/config-v1.1.xml',
  'get /mail/mobileconfig',
  'post /autodiscover/autodiscover.xml',
  'post /Autodiscover/Autodiscover.xml',
  'get /admin/auth/oidc/start',
  'get /admin/auth/oidc/callback',
  'get /metrics',
]);

/** Enumerate mounted `${method} ${path}` pairs, normalizing :param → {param}. */
function mountedRoutes(app: Express): Set<string> {
  const out = new Set<string>();
  const visit = (stack: unknown[]) => {
    for (const layer of stack as Array<{
      route?: { path: string; methods: Record<string, boolean> };
      name?: string;
      handle?: { stack?: unknown[] };
    }>) {
      if (layer.route) {
        const path = layer.route.path;
        if (typeof path !== 'string' || !CLEAN_PATH.test(path)) continue;
        const normalized = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        for (const method of Object.keys(layer.route.methods)) {
          if (HTTP_METHODS.has(method)) out.add(`${method} ${normalized}`);
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        visit(layer.handle.stack);
      }
    }
  };
  visit((app as unknown as { _router: { stack: unknown[] } })._router.stack);
  return out;
}

function specRoutes(): Set<string> {
  const doc = buildOpenApiDocument('0.0.0') as { paths: Record<string, Record<string, unknown>> };
  const out = new Set<string>();
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const method of Object.keys(ops)) out.add(`${method} ${path}`);
  }
  return out;
}

describe('OpenAPI route coverage', () => {
  const h = createTestDb();
  const app = createTestApp(h).app;
  const mounted = mountedRoutes(app);
  const spec = specRoutes();

  it('documents every mounted route (or allow-lists it)', () => {
    const missing = [...mounted].filter((r) => !spec.has(r) && !UNDOCUMENTED.has(r)).sort();
    expect(missing).toEqual([]);
  });

  it('does not document a route that is not mounted', () => {
    const stale = [...spec].filter((r) => !mounted.has(r)).sort();
    expect(stale).toEqual([]);
  });
});
