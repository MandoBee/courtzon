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

/** Parse export const translationKeysRegistry from the frontend registry file. */
export function parseTranslationKeysRegistry(registryPath?: string): RegistryTranslationKey[] {
  const path =
    registryPath ||
    resolve(__dirname, '../../../../../frontend/src/i18n/translation-keys.registry.ts');
  const content = readFileSync(path, 'utf8');
  const entryRe =
    /\{\s*key:\s*['"]([^'"]+)['"],\s*defaultValue:\s*(['"])((?:\\.|(?!\2).)*)\2,\s*moduleSlug:\s*['"]([^'"]+)['"],\s*elementType:\s*['"]([^'"]+)['"],\s*elementLabel:\s*(['"])((?:\\.|(?!\6).)*)\6(?:,\s*componentPath:\s*['"]([^'"]*)['"])?\s*\}/g;

  const entries: RegistryTranslationKey[] = [];
  let match;
  while ((match = entryRe.exec(content)) !== null) {
    const unescape = (s: string) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
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
