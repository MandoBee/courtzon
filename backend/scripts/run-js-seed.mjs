/**
 * Runs database/seed/run.mjs from backend context so mysql2 resolves from backend/node_modules.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await import(pathToFileURL(resolve(projectRoot, 'database/seed/run.mjs')).href);
