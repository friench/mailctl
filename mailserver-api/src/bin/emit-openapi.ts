import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../lib/openapi';
import { appVersion } from '../version';

/**
 * Emit the OpenAPI document to a file (default `openapi.json`) for CI checks and
 * client/doc generation. Usage: `pnpm openapi:emit [outfile]`.
 */
const outfile = process.argv[2] ?? 'openapi.json';
const doc = buildOpenApiDocument(appVersion());
writeFileSync(outfile, `${JSON.stringify(doc, null, 2)}\n`);
console.error(`Wrote ${outfile} (${Object.keys(doc.paths as object).length} paths)`);
