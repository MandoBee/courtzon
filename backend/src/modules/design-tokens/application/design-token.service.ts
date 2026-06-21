import { designTokenRepository } from '../infrastructure/design-token.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

class DesignTokenService {
  async list(page = 1, limit = 50) {
    return designTokenRepository.findAll({ page, limit });
  }

  async get(id: number) {
    const token = await designTokenRepository.findById(id);
    if (!token) throw new NotFoundError('Design token');
    return token;
  }

  async create(data: { token_key: string; token_type: string; default_value: string; current_value?: string; category?: string; description?: string }) {
    const existing = await designTokenRepository.findByKey(data.token_key);
    if (existing) throw new Error('Token key already exists');
    const id = await designTokenRepository.create(data);
    return { id, ...data };
  }

  async update(id: number, data: any) {
    const existing = await designTokenRepository.findById(id);
    if (!existing) throw new NotFoundError('Design token');
    await designTokenRepository.update(id, data);
    return { id, ...existing, ...data };
  }

  async delete(id: number) {
    const existing = await designTokenRepository.findById(id);
    if (!existing) throw new NotFoundError('Design token');
    await designTokenRepository.delete(id);
    return { success: true };
  }

  // -- Appearance Studio ----------------------------------------------------

  async getPublishedTheme() {
    return designTokenRepository.getPublishedThemePayload();
  }

  async listForEditor() {
    const [tokens, versions, resetBaseline] = await Promise.all([
      designTokenRepository.findAllForEditor(),
      designTokenRepository.listVersions(25),
      designTokenRepository.getResetBaseline(),
    ]);
    return { tokens, versions, resetBaseline };
  }

  async getThemeForUser(userId: number) {
    const global = await designTokenRepository.getPublishedThemePayload();
    const role = await designTokenRepository.getUserAppearanceRoleId(userId);
    const editableKeys = await designTokenRepository.getRoleEditableKeys();
    if (!role) {
      return { theme: global, editableKeys, roleId: null, roleSlug: null, roleName: null };
    }
    const overrides = await designTokenRepository.getRoleOverrides(role.roleId);
    return {
      theme: {
        shared: { ...global.shared, ...overrides },
        light: { ...global.light, ...overrides },
        dark: { ...global.dark, ...overrides },
      },
      editableKeys,
      roleId: role.roleId,
      roleSlug: role.roleSlug,
      roleName: role.roleName,
    };
  }

  async saveResetBaseline(savedBy: number | null, label?: string | null) {
    const snapshot = await designTokenRepository.getPublishedThemePayload();
    await designTokenRepository.saveResetBaseline(snapshot, savedBy, label);
    return { success: true };
  }

  async restoreResetBaseline(publishedBy: number | null) {
    await designTokenRepository.restoreResetBaseline(publishedBy);
    return { success: true };
  }

  async saveRoleEditable(flags: Record<string, boolean>) {
    await designTokenRepository.saveRoleEditable(flags);
    return { success: true, count: Object.keys(flags).length };
  }

  async getRoleTheme(roleId: number) {
    const overrides = await designTokenRepository.getRoleOverrides(roleId);
    const editableKeys = await designTokenRepository.getRoleEditableKeys();
    const global = await designTokenRepository.getPublishedThemePayload();
    return { overrides, editableKeys, global };
  }

  async saveRoleTheme(roleId: number, tokens: Record<string, string | null>) {
    await designTokenRepository.saveRoleOverrides(roleId, tokens);
    return { success: true };
  }

  async saveMyRoleTheme(userId: number, tokens: Record<string, string | null>) {
    const role = await designTokenRepository.getUserAppearanceRoleId(userId);
    if (!role) throw new Error('No appearance customization role');
    const editable = new Set(await designTokenRepository.getRoleEditableKeys());
    const filtered: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(tokens)) {
      if (editable.has(key)) filtered[key] = value;
    }
    await designTokenRepository.saveRoleOverrides(role.roleId, filtered);
    return { success: true, roleId: role.roleId };
  }

  async saveDrafts(tokens: Record<string, string | null>, tokensDark?: Record<string, string | null>) {
    await designTokenRepository.saveDrafts(tokens, tokensDark ?? {});
    return { success: true, count: Object.keys(tokens).length + Object.keys(tokensDark ?? {}).length };
  }

  async publish(publishedBy: number | null, label?: string | null) {
    const versionId = await designTokenRepository.publish(publishedBy, label);
    return { success: true, versionId };
  }

  async rollback(versionId: number, publishedBy: number | null) {
    const version = await designTokenRepository.getVersion(versionId);
    if (!version) throw new NotFoundError('Theme version');
    await designTokenRepository.rollback(versionId, publishedBy);
    return { success: true };
  }
}

export const designTokenService = new DesignTokenService();
