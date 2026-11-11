import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * D4 Expanded — every export permission must be registered exactly once in the
 * UI registry (the single source of truth used by sync-ui-registry.js).
 */

const readRegistry = () => fs.readFileSync(path.join(__dirname, 'registry.ts'), 'utf-8');

const NEW_KEYS = [
  'accounting.export',
  'settlements.export',
  'financial.export',
  'notifications.webhooks.export',
  'translations.export',
];

const EXISTING_KEYS = ['reports.export', 'audit.export', 'bi.export'];

describe('D4 Expanded — export permission registry', () => {
  it('registers every new export permission exactly once', () => {
    const src = readRegistry();
    for (const key of NEW_KEYS) {
      const occurrences = src.split(`permissionKey: '${key}'`).length - 1;
      expect(occurrences, key).toBe(1);
    }
  });

  it('keeps the pre-existing export permissions exactly once', () => {
    const src = readRegistry();
    for (const key of EXISTING_KEYS) {
      const occurrences = src.split(`permissionKey: '${key}'`).length - 1;
      expect(occurrences, key).toBe(1);
    }
  });

  it('does not introduce duplicate export permission keys', () => {
    // The registry already contains a few historical duplicate keys outside the
    // export families; this change must not add another one.
    const src = readRegistry();
    const keys: string[] = [];
    const re = /permissionKey:\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) keys.push(m[1]);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    for (const key of [...NEW_KEYS, ...EXISTING_KEYS]) {
      expect(duplicates, key).not.toContain(key);
    }
  });

  it('uses the established module slug and element type for each new key', () => {
    const src = readRegistry();
    const expected: Record<string, { moduleSlug: string; elementType: string }> = {
      'accounting.export': { moduleSlug: 'accounting', elementType: 'action' },
      'settlements.export': { moduleSlug: 'settlements', elementType: 'action' },
      'financial.export': { moduleSlug: 'financial', elementType: 'action' },
      'notifications.webhooks.export': { moduleSlug: 'notifications', elementType: 'action' },
      'translations.export': { moduleSlug: 'translations', elementType: 'action' },
    };
    for (const [key, meta] of Object.entries(expected)) {
      const line = src.split('\n').find((l) => l.includes(`permissionKey: '${key}'`));
      expect(line, key).toBeTruthy();
      expect(line).toContain(`moduleSlug: '${meta.moduleSlug}'`);
      expect(line).toContain(`elementType: '${meta.elementType}'`);
    }
  });
});
