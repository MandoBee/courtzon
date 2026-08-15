import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RegistryTranslationKey {
  key: string;
  defaultValue: string;
  moduleSlug: string;
  elementType: string;
  elementLabel: string;
  componentPath?: string;
}

/** Resolve the registry file path — prefers build-time JSON artifact, falls back to TS source. */
function resolveRegistryPath(registryPath?: string): string {
  if (registryPath) return registryPath;

  // Build-time artifact (in dist/generated/ at runtime)
  const artifactPath = resolve(__dirname, '../../../generated/translation-keys.json');
  try {
    readFileSync(artifactPath, 'utf8');
    return artifactPath;
  } catch { /* fall through */ }

  // Docker path (frontend registry copied into backend image)
  const dockerPath = resolve('/app', 'frontend-registry.ts');
  try {
    readFileSync(dockerPath, 'utf8');
    return dockerPath;
  } catch { /* fall through */ }

  // Development path (backend runs next to frontend source)
  return resolve(__dirname, '../../../../../frontend/src/i18n/translation-keys.registry.ts');
}

/** Parse export const translationKeysRegistry from the registry file (TS or JSON). */
export function parseTranslationKeysRegistry(registryPath?: string): RegistryTranslationKey[] {
  const path = resolveRegistryPath(registryPath);
  const content = readFileSync(path, 'utf8');

  // JSON artifact format
  if (path.endsWith('.json')) {
    const entries = JSON.parse(content) as RegistryTranslationKey[];
    if (!entries.length) throw new Error(`Empty JSON artifact at ${path}`);
    return entries;
  }

  // TS source format
  const entryRe =
    /\{\s*key:\s*['"]([^'"]+)['"],\s*defaultValue:\s*(['"])((?:\\.|(?!\2).)*)\2,\s*moduleSlug:\s*['"]([^'"]+)['"],\s*elementType:\s*['"]([^'"]+)['"],\s*elementLabel:\s*(['"])((?:\\.|(?!\6).)*)\6(?:,\s*componentPath:\s*['"]([^'"]*)['"])?\s*\}/g;

  const entries: RegistryTranslationKey[] = [];
  let match;
  while ((match = entryRe.exec(content)) !== null) {
    const unescape = (s: string) => s
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    entries.push({
      key: match[1],
      defaultValue: unescape(match[3]),
      moduleSlug: match[4],
      elementType: match[5],
      elementLabel: unescape(match[7]),
      componentPath: match[8] || undefined,
    });
  }

  if (!entries.length) {
    throw new Error(`No translation key entries parsed from ${path}`);
  }

  return entries;
}
