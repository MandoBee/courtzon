import api from './api';

/**
 * Phase A — Super Admin sport format / rule-set management API client.
 * Formats and rule-set versions are platform reference data; rule-set versions
 * are immutable once referenced by history (the backend enforces this with 409).
 */

export type SportFormatType = 'singles' | 'doubles' | 'team';

export interface SportFormatRow {
  id: number;
  sportId: number;
  sportName: string;
  slug: string;
  name: string;
  formatType: SportFormatType;
  playersPerSide: number | null;
  rosterSize: number | null;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  ruleSetCount: number;
  referenceCount: number;
}

export interface SportRuleSetRow {
  id: number;
  formatId: number;
  version: number;
  name: string | null;
  rules: Record<string, unknown>;
  standingsRules: Record<string, unknown> | null;
  isActive: boolean;
  isDefault: boolean;
  referenceCount: number;
  createdAt?: string | null;
}

export interface SportFormatDetail extends SportFormatRow {
  ruleSets: SportRuleSetRow[];
}

export const sportConfigApi = {
  listFormats: (sportId?: number): Promise<SportFormatRow[]> =>
    api.get('/admin/sport-formats', { params: sportId ? { sportId } : {} }).then((r) => r.data.data),

  getFormat: (id: number): Promise<SportFormatDetail> =>
    api.get(`/admin/sport-formats/${id}`).then((r) => r.data.data),

  createFormat: (sportId: number, data: Record<string, unknown>): Promise<SportFormatRow> =>
    api.post(`/admin/sports/${sportId}/formats`, data).then((r) => r.data.data),

  updateFormat: (id: number, data: Record<string, unknown>): Promise<SportFormatRow> =>
    api.put(`/admin/sport-formats/${id}`, data).then((r) => r.data.data),

  deleteFormat: (id: number): Promise<{ deleted: boolean }> =>
    api.delete(`/admin/sport-formats/${id}`).then((r) => r.data.data),

  listRuleSets: (formatId: number): Promise<SportRuleSetRow[]> =>
    api.get(`/admin/sport-formats/${formatId}/rule-sets`).then((r) => r.data.data),

  createRuleSet: (formatId: number, data: Record<string, unknown>): Promise<SportRuleSetRow> =>
    api.post(`/admin/sport-formats/${formatId}/rule-sets`, data).then((r) => r.data.data),

  updateRuleSet: (id: number, data: Record<string, unknown>): Promise<SportRuleSetRow> =>
    api.put(`/admin/sport-rule-sets/${id}`, data).then((r) => r.data.data),

  activateRuleSet: (id: number): Promise<SportRuleSetRow> =>
    api.post(`/admin/sport-rule-sets/${id}/activate`).then((r) => r.data.data),

  deactivateRuleSet: (id: number): Promise<SportRuleSetRow> =>
    api.post(`/admin/sport-rule-sets/${id}/deactivate`).then((r) => r.data.data),
};
