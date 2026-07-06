import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../lib/openapi';

/**
 * Emit the OpenAPI document to a file (default `openapi.json`) for CI checks and
 * client/doc generation. Usage: `pnpm openapi:emit [outfile]`.
 */
const outfile = process.argv[2] ?? 'openapi.json';
const doc = buildOpenApiDocument(process.env.npm_package_version ?? '0.1.0');
writeFileSync(outfile, `${JSON.stringify(doc, null, 2)}\n`);
console.error(`Wrote ${outfile} (${Object.keys(doc.paths as object).length} paths)`);
