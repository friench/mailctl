import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from '../../src/lib/openapi';

// Minimal shape for the fields the tests assert on.
interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  tags: { name: string }[];
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
  paths: Record<
    string,
    Record<
      string,
      { security: unknown[]; requestBody?: unknown; responses: Record<string, unknown> }
    >
  >;
}

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument('9.9.9') as unknown as OpenApiDoc;

  it('is a well-formed OpenAPI 3.1 document', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('9.9.9');
    expect(doc.info.title).toContain('mailctl');
    // Round-trips as JSON (no functions / circular refs).
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it('declares the API-key and session security schemes', () => {
    expect(doc.components.securitySchemes).toHaveProperty('ApiKeyAuth');
    expect(doc.components.securitySchemes).toHaveProperty('SessionCookie');
  });

  it('documents the public send API with a request body from the validator', () => {
    const send = doc.paths['/send']!.post!;
    expect(send.security).toEqual([{ ApiKeyAuth: [] }]);
    const schema = (
      send.requestBody as { content: Record<string, { schema: { properties: object } }> }
    ).content['application/json']!.schema;
    // Derived from sendBodySchema — so it can't drift from validation.
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['to', 'subject', 'html']),
    );
  });

  it('marks admin endpoints as accepting either an API key or the session cookie', () => {
    expect(doc.paths['/admin/api/domains']!.get!.security).toEqual([
      { ApiKeyAuth: [] },
      { SessionCookie: [] },
    ]);
  });

  it('leaves public endpoints unauthenticated', () => {
    expect(doc.paths['/health']!.get!.security).toEqual([]);
    expect(doc.paths['/openapi.json']!.get!.security).toEqual([]);
  });

  it('covers the core resources', () => {
    for (const p of [
      '/send',
      '/jobs',
      '/admin/api/mailboxes',
      '/admin/api/suppressions',
      '/admin/api/bounces/ingest',
      '/admin/api/api-keys',
    ]) {
      expect(doc.paths).toHaveProperty(p);
    }
  });
});
