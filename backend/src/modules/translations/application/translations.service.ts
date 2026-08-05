import { translationsRepository } from '../infrastructure/repositories/translations.repository.js';
import { translationKeysRepository } from '../infrastructure/translation-keys.repository.js';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordAudit } from '../../audit-log/index.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = existsSync(resolve('/app', 'frontend-registry.ts'))
  ? resolve('/app', 'frontend-registry.ts')
  : resolve(__dirname, '../../../../../frontend/src/i18n/translation-keys.registry.ts');

type RowData = mysql.RowDataPacket[];

const bundleCache = new Map<string, { data: Record<string, string>; ts: number }>();
const BUNDLE_CACHE_TTL = 300_000; // 5 minutes

function invalidateBundleCache(): void {
  bundleCache.clear();
}

function computeRegistryHash(): string {
  const content = readFileSync(registryPath, 'utf8');
  return createHash('sha256').update(content).digest('hex');
}

export const translationsService = {
  async list(locale?: string, search?: string) {
    return translationsRepository.list(locale, search);
  },

  async getGrid(opts: { page: number; limit: number; search?: string; module?: string; elementType?: string }) {
    const { rows, total, page, limit } = await translationKeysRepository.listPaginated(opts);
    const keys = rows.map((r) => r.key);

    const pool = getPool();
    const [langRows] = await pool.execute<RowData>(
      `SELECT code FROM languages WHERE is_active = TRUE AND code != 'en' ORDER BY sort_order, code`
    );
    const locales = (langRows as { code: string }[]).map((r) => r.code);

    const translationRows = keys.length
      ? await translationsRepository.getValuesForKeys(keys, locales)
      : [];

    const localesWithPacks = await translationsRepository.listDistinctLocales();

    const valueMap: Record<string, Record<string, { id?: number; value: string }>> = {};
    for (const tr of translationRows as { id: number; key: string; locale: string; value: string }[]) {
      if (!valueMap[tr.key]) valueMap[tr.key] = {};
      valueMap[tr.key][tr.locale] = { id: tr.id, value: tr.value };
    }

    const data = rows.map((row) => ({
      key: row.key,
      defaultValue: row.default_value,
      moduleSlug: row.module_slug,
      elementType: row.element_type,
      elementLabel: row.element_label,
      translations: locales.reduce(
        (acc, loc) => {
          acc[loc] = valueMap[row.key]?.[loc]?.value ?? '';
          return acc;
        },
        {} as Record<string, string>
      ),
      translationIds: locales.reduce(
        (acc, loc) => {
          const id = valueMap[row.key]?.[loc]?.id;
          if (id) acc[loc] = id;
          return acc;
        },
        {} as Record<string, number>
      ),
    }));

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      locales,
      localesWithPacks,
    };
  },

  async syncKeysFromRegistry() {
    const { parseTranslationKeysRegistry } = await import('../infrastructure/translation-registry-parser.js');
    const newHash = computeRegistryHash();
    const storedHash = await translationKeysRepository.getRegistryHash();
    if (storedHash === newHash) {
      return { inserted: 0, updated: 0, deprecated: 0, total: 0, skipped: true, reason: 'No changes detected' };
    }
    const entries = parseTranslationKeysRegistry(registryPath);
    let inserted = 0;
    let updated = 0;
    const activeKeys = new Set<string>();
    for (const entry of entries) {
      activeKeys.add(entry.key);
      const result = await translationKeysRepository.upsertKey({
        key: entry.key,
        defaultValue: entry.defaultValue,
        moduleSlug: entry.moduleSlug,
        elementType: entry.elementType,
        elementLabel: entry.elementLabel,
        componentPath: entry.componentPath,
      });
      if (result === 'inserted') inserted++;
      else if (result === 'updated') updated++;
    }
    const deprecated = await translationKeysRepository.deprecateMissingKeys(activeKeys);
    await translationKeysRepository.setRegistryHash(newHash);
    invalidateBundleCache();
    return { inserted, updated, deprecated, total: entries.length, skipped: false };
  },

  async createLocalePack(locale: string) {
    if (locale === 'en') throw new Error('English defaults live in translation keys catalog');
    const hasAny = await translationsRepository.localeHasAnyTranslation(locale);
    if (hasAny) {
      throw new Error(`Locale "${locale}" already has translations. Use Sync to add missing keys.`);
    }
    const keys = await translationKeysRepository.listAllKeys();
    const inserted = await translationsRepository.createLocalePack(locale, keys);
    return { locale, inserted, total: keys.length };
  },

  async syncMissingKeysForLocale(locale: string) {
    if (locale === 'en') throw new Error('English defaults live in translation keys catalog');
    const keys = await translationKeysRepository.listAllKeys();
    const inserted = await translationsRepository.createLocalePack(locale, keys);
    return { locale, inserted, total: keys.length };
  },

  async getLocalePack(locale: string) {
    return translationKeysRepository.listForLocalePack(locale);
  },

  async getPublicBundle(locale: string) {
    const cached = bundleCache.get(locale);
    if (cached && Date.now() - cached.ts < BUNDLE_CACHE_TTL) return cached.data;
    const defaults = await translationKeysRepository.getDefaultsMap();
    if (locale === 'en') {
      bundleCache.set(locale, { data: defaults, ts: Date.now() });
      return defaults;
    }
    const overrides = await translationsRepository.getValuesByLocale(locale);
    const merged = { ...defaults };
    for (const [key, value] of Object.entries(overrides)) {
      if (value.trim()) merged[key] = value;
    }
    bundleCache.set(locale, { data: merged, ts: Date.now() });
    return merged;
  },

  async listModules() {
    return translationKeysRepository.listModules();
  },

  async listElementTypes() {
    return translationKeysRepository.listElementTypes();
  },

  async getById(id: number) {
    const t = await translationsRepository.getById(id);
    if (!t) throw new Error('Translation not found');
    return t;
  },

  async create(data: { key: string; locale: string; value: string; isAuto?: boolean }) {
    if (data.locale === 'en') throw new Error('English defaults are managed via translation keys');
    const existing = await translationsRepository.getByKeyAndLocale(data.key, data.locale);
    if (existing) throw new Error(`Translation already exists for key "${data.key}" and locale "${data.locale}"`);
    const id = await translationsRepository.create(data);
    recordAudit({
      actorId: 0,
      action: 'TRANSLATION.CREATE',
      entityType: 'translation',
      entityId: id,
      afterState: { key: data.key, locale: data.locale, value: data.value },
    });
    return translationsRepository.getById(id);
  },

  async upsert(data: { key: string; locale: string; value: string; isAuto?: boolean }) {
    if (data.locale === 'en') throw new Error('English defaults are managed via translation keys');
    const keyRow = await translationKeysRepository.getByKey(data.key);
    if (!keyRow) throw new Error(`Unknown translation key "${data.key}". Run Sync first.`);
    await translationsRepository.upsert(data);
    recordAudit({
      actorId: 0,
      action: 'TRANSLATION.UPSERT',
      entityType: 'translation',
      entityId: 0,
      afterState: { key: data.key, locale: data.locale, value: data.value },
    });
    return translationsRepository.getByKeyAndLocale(data.key, data.locale);
  },

  async update(id: number, data: { value?: string; isAuto?: boolean }) {
    const existing = await translationsRepository.getById(id);
    if (!existing) throw new Error('Translation not found');
    await translationsRepository.update(id, data);
    recordAudit({
      actorId: 0,
      action: 'TRANSLATION.UPDATE',
      entityType: 'translation',
      entityId: id,
      afterState: { value: data.value },
    });
    invalidateBundleCache();
    return translationsRepository.getById(id);
  },

  async delete(id: number) {
    const existing = await translationsRepository.getById(id);
    if (!existing) throw new Error('Translation not found');
    await translationsRepository.delete(id);
    recordAudit({
      actorId: 0,
      action: 'TRANSLATION.DELETE',
      entityType: 'translation',
      entityId: id,
    });
    invalidateBundleCache();
  },

  async listLocales() {
    const pool = getPool();
    const [langRows] = await pool.execute<RowData>(
      `SELECT code FROM languages WHERE is_active = TRUE ORDER BY sort_order, code`
    );
    return (langRows as { code: string }[]).map((r) => r.code);
  },

  async listKeys() {
    return translationKeysRepository.listAllKeys();
  },

  async exportAll() {
    return translationsRepository.exportAll();
  },
};
