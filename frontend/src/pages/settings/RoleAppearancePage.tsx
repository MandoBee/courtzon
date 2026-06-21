import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Can } from '../../permissions/Can';
import { useAppearanceStore } from '../../store/appearance.store';
import {
  COMPONENT_DEFINITIONS,
  getPropertyMeta,
  isComponentStyleToken,
} from '../../theme/component-styles';
import { TOKEN_GROUPS, isCssVarToken, type PublishedThemePayload } from '../../theme/tokens';

function flattenThemePayload(raw: unknown): Record<string, string> {
  if (raw && typeof raw === 'object' && 'shared' in (raw as object)) {
    const p = raw as PublishedThemePayload;
    return { ...p.shared, ...p.light, ...p.dark };
  }
  return (raw || {}) as Record<string, string>;
}
import { VisualStyleControl } from '../admin/design-tokens/VisualStyleControl';
import { ThemePreviewPane } from '../admin/design-tokens/ThemePreviewPane';

export default function RoleAppearancePage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const refetchAppearance = useAppearanceStore((s) => s.fetch);
  const roleName = useAppearanceStore((s) => s.roleName);

  const { data, isLoading } = useQuery({
    queryKey: ['my-appearance-theme'],
    queryFn: () => api.get('/appearance/theme').then((r: any) => r.data),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.theme) setDraft(flattenThemePayload(data.theme));
  }, [data?.theme]);

  const editableSet = useMemo(() => new Set<string>(data?.editableKeys || []), [data?.editableKeys]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, string | null> = {};
      const base = flattenThemePayload(data?.theme);
      for (const key of editableSet) {
        if (draft[key] !== undefined && draft[key] !== base[key]) payload[key] = draft[key];
        else if (draft[key] === base[key]) payload[key] = null;
      }
      return api.put('/appearance/my-theme', { tokens: payload });
    },
    onSuccess: async () => {
      await refetchAppearance();
      qc.invalidateQueries({ queryKey: ['my-appearance-theme'] });
      showToast('Your appearance preferences were saved');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Save failed'), 'error'),
  });

  if (isLoading) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading appearance settings…</p>;
  }

  if (!editableSet.size) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-text-muted)]">
          No appearance options are available for your role. Ask an administrator to enable customization in Appearance Studio.
        </p>
      </Card>
    );
  }

  return (
    <Can permission="appearance.role-customize">
      <div className="max-w-4xl space-y-4">
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text)]">My appearance</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Customize look and feel for your role{roleName ? ` (${roleName})` : ''}. Changes apply only to you and others with the same role.
          </p>
        </div>

        {COMPONENT_DEFINITIONS.map((def) => {
          const props = def.properties.filter((p) => editableSet.has(p.tokenKey));
          if (!props.length) return null;
          return (
            <Card key={def.id} className="space-y-2">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">{def.label}</h2>
              {props.map((prop) => (
                <div key={prop.tokenKey} className="flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 pb-2">
                  <span className="flex-1 text-xs">{prop.label}</span>
                  <VisualStyleControl
                    meta={prop}
                    value={draft[prop.tokenKey] ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, [prop.tokenKey]: v }))}
                  />
                </div>
              ))}
            </Card>
          );
        })}

        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Brand colors & fonts</h2>
          {TOKEN_GROUPS.map((g) => {
            const keys = [...editableSet].filter((k) => {
              const meta = getPropertyMeta(k);
              if (meta) return false;
              if (isComponentStyleToken(k)) return false;
              return true;
            });
            const groupKeys = keys.filter((k) => {
              const t = data?.theme;
              return t && k.startsWith('color') ? g.category === 'brand' || g.category === 'semantic' : false;
            });
            if (!groupKeys.length && g.category !== 'brand' && g.category !== 'semantic') return null;
            const filtered = [...editableSet].filter((k) => !isComponentStyleToken(k) && !getPropertyMeta(k));
            if (g.category === 'brand') {
              const brandKeys = filtered.filter((k) => k.startsWith('color-primary') || k.startsWith('color-secondary') || k.startsWith('color-accent'));
              if (!brandKeys.length) return null;
              return (
                <div key={g.category}>
                  <p className="text-[10px] text-[var(--color-text-muted)] mb-1">{g.label}</p>
                  {brandKeys.map((k) => (
                    <div key={k} className="flex gap-2 mb-1">
                      <span className="flex-1 text-xs font-mono truncate">{k}</span>
                      <input value={draft[k] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                        className="w-28 px-2 py-1 text-xs border rounded-[var(--radius-sm)]" />
                    </div>
                  ))}
                </div>
              );
            }
            return null;
          })}
          {[...editableSet].filter((k) => !isComponentStyleToken(k) && !getPropertyMeta(k) && isCssVarToken(k)).map((k) => (
            <div key={k} className="flex gap-2">
              <span className="flex-1 text-xs font-mono truncate">{k}</span>
              <input value={draft[k] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                className="w-28 px-2 py-1 text-xs border rounded-[var(--radius-sm)]" />
            </div>
          ))}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-2">Preview</h2>
          <ThemePreviewPane draft={draft} showAllComponents />
        </Card>

        <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Save my appearance
        </Button>
      </div>
    </Can>
  );
}
