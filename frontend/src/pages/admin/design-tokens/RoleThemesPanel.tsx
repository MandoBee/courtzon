import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { getErrorMessage } from '../../../utils/errors';
import { useToast } from '../../../components/ui/Toast';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Can } from '../../../permissions/Can';
import {
  COMPONENT_DEFINITIONS,
  COMPONENT_STYLE_DEFAULTS,
  isComponentStyleToken,
} from '../../../theme/component-styles';
import { TOKEN_GROUPS, isCssVarToken, type EditorToken } from '../../../theme/tokens';
import { VisualStyleControl } from './VisualStyleControl';
import { getPropertyMeta } from '../../../theme/component-styles';
import { ThemePreviewPane } from './ThemePreviewPane';
import { StickyPreviewPanel } from './StickyPreviewPanel';

function publishedValue(t: EditorToken): string {
  return t.current_value ?? t.default_value;
}

export function RoleThemesPanel({
  tokens,
  draft,
}: {
  tokens: EditorToken[];
  draft: Record<string, string>;
}) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [roleId, setRoleId] = useState<number | ''>('');

  const { data: roles } = useQuery({
    queryKey: ['roles-list'],
    queryFn: () => api.get('/roles').then((r: any) => r.data.data as { id: number; name: string; slug: string }[]),
  });

  const { data: roleTheme, isLoading } = useQuery({
    queryKey: ['role-theme', roleId],
    queryFn: () => api.get(`/design-tokens/role-theme/${roleId}`).then((r: any) => r.data),
    enabled: !!roleId,
  });

  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!roleTheme || !roleId) return;
    const merged: Record<string, string> = {};
    for (const t of tokens) {
      if (!isCssVarToken(t.token_key)) continue;
      const override = roleTheme.overrides?.[t.token_key];
      merged[t.token_key] =
        override ??
        roleTheme.global?.[t.token_key] ??
        draft[t.token_key] ??
        publishedValue(t);
    }
    setRoleDraft(merged);
  }, [roleTheme, roleId, tokens, draft]);

  const editableKeys = useMemo(
    () => new Set((roleTheme?.editableKeys || []) as string[]),
    [roleTheme?.editableKeys],
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, string | null> = {};
      const global = roleTheme?.global || {};
      for (const [key, val] of Object.entries(roleDraft)) {
        if (val !== global[key]) payload[key] = val;
        else payload[key] = null;
      }
      return api.put(`/design-tokens/role-theme/${roleId}`, { tokens: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role-theme', roleId] });
      showToast('Role theme saved');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Save failed'), 'error'),
  });

  const roleEditableTokens = useMemo(() => {
    const list: { key: string; label: string; token?: EditorToken }[] = [];
    for (const t of tokens) {
      if (!isCssVarToken(t.token_key)) continue;
      if (!t.role_editable && !editableKeys.has(t.token_key)) continue;
      const meta = getPropertyMeta(t.token_key);
      list.push({
        key: t.token_key,
        label: meta?.label || t.description || t.token_key,
        token: t,
      });
    }
    return list;
  }, [tokens, editableKeys]);

  const componentTokens = roleEditableTokens.filter((x) => isComponentStyleToken(x.key));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <div className="lg:col-span-2 space-y-4">
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Role theme overrides</h2>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Set appearance overrides for a role. Only tokens marked &quot;Role can customize&quot; apply to users with{' '}
            <code className="text-[10px]">appearance.role-customize</code>.
          </p>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')}
            className="w-full max-w-md"
          >
            <option value="">Select role…</option>
            {(roles || []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.slug})
              </option>
            ))}
          </select>
        </Card>

        {roleId && isLoading && <p className="text-xs text-[var(--color-text-muted)]">Loading role theme…</p>}

        {roleId && !isLoading && (
          <>
            {COMPONENT_DEFINITIONS.map((def) => {
              const props = def.properties.filter((p) => {
                const t = tokens.find((x) => x.token_key === p.tokenKey);
                return t?.role_editable;
              });
              if (!props.length) return null;
              return (
                <Card key={def.id} className="space-y-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">{def.label}</h3>
                  {props.map((prop) => {
                    const token = tokens.find((t) => t.token_key === prop.tokenKey);
                    const value = roleDraft[prop.tokenKey] ?? COMPONENT_STYLE_DEFAULTS[prop.tokenKey] ?? '';
                    return (
                      <div key={prop.tokenKey} className="flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 pb-2">
                        <span className="flex-1 text-xs text-[var(--color-text)]">{prop.label}</span>
                        <VisualStyleControl
                          meta={prop}
                          value={value}
                          onChange={(v) => setRoleDraft((d) => ({ ...d, [prop.tokenKey]: v }))}
                        />
                        {token && (
                          <button
                            type="button"
                            className="text-[10px] text-[var(--color-text-muted)]"
                            onClick={() =>
                              setRoleDraft((d) => ({
                                ...d,
                                [prop.tokenKey]: publishedValue(token),
                              }))
                            }
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    );
                  })}
                </Card>
              );
            })}

            <Card className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Global tokens (role-editable)</h3>
              {TOKEN_GROUPS.map((g) => {
                const groupTokens = tokens.filter(
                  (t) => (t.category || '') === g.category && t.role_editable && isCssVarToken(t.token_key) && !isComponentStyleToken(t.token_key),
                );
                if (!groupTokens.length) return null;
                return (
                  <div key={g.category} className="space-y-1">
                    <p className="text-[10px] text-[var(--color-text-muted)]">{g.label}</p>
                    {groupTokens.map((t) => (
                      <div key={t.token_key} className="flex items-center gap-2">
                        <span className="flex-1 text-xs truncate">{t.description || t.token_key}</span>
                        <input
                          value={roleDraft[t.token_key] ?? ''}
                          onChange={(e) => setRoleDraft((d) => ({ ...d, [t.token_key]: e.target.value }))}
                          className="w-32 px-2 py-1 text-xs border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </Card>

            <Can permission="design-tokens.edit">
              <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                Save role theme
              </Button>
            </Can>
          </>
        )}
      </div>

      <StickyPreviewPanel title="Role preview">
        {roleId ? (
          <ThemePreviewPane draft={roleDraft} showAllComponents />
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">Select a role to preview.</p>
        )}
        {roleId && componentTokens.length === 0 && (
          <p className="text-[10px] text-[var(--color-warning-text)]">
            No tokens marked as role-editable yet. Enable checkboxes on the Components / Global tabs.
          </p>
        )}
      </StickyPreviewPanel>
    </div>
  );
}
