import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useAppearanceStore } from '../../../store/appearance.store';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import {
  TOKEN_GROUPS,
  GOOGLE_FONTS,
  GOOGLE_FONT_TOKEN_KEY,
  effectiveValue,
  effectiveValueDark,
  isCssVarToken,
  isDualModeThemeToken,
  PREVIEW_SEMANTIC_DARK,
  PREVIEW_SEMANTIC_LIGHT,
  THEME_COLOR_KEYS,
  HERO_THEME_KEYS,
  PREVIEW_HERO_LIGHT,
  PREVIEW_HERO_DARK,
  type EditorToken,
  type ThemeVersion,
} from '../../../theme/tokens';
import { isComponentStyleToken, COMPONENT_STYLE_DEFAULTS } from '../../../theme/component-styles';
import { isLandingStyleToken, LANDING_STYLE_DEFAULTS } from '../../../theme/landing-styles';
import { ComponentStudioPanel } from './ComponentStudioPanel';
import { LandingStudioPanel } from './LandingStudioPanel';
import { ColorSchemePanel } from './ColorSchemePanel';
import { ColorPickerField } from './ColorPickerField';
import { GradientPickerField } from './GradientPickerField';
import { gradientLabel } from '../../../theme/gradient-utils';
import { StylePropertyRow, StylePropertyRowHeader } from './StylePropertyRow';
import { RoleEditableCheckbox } from './RoleEditableCheckbox';
import { ResetTokenButton } from './ResetTokenButton';
import { ThemePreviewPane } from './ThemePreviewPane';
import { StickyPreviewPanel } from './StickyPreviewPanel';
import { RoleThemesPanel } from './RoleThemesPanel';

interface ResetBaselineInfo {
  label: string | null;
  saved_at: string;
  saved_by_name: string | null;
}

interface StudioResponse {
  tokens: EditorToken[];
  versions: ThemeVersion[];
  resetBaseline: ResetBaselineInfo | null;
}

function publishedValue(t: EditorToken): string {
  return t.current_value ?? t.default_value;
}

function publishedValueDark(t: EditorToken): string {
  return t.current_value_dark ?? t.default_value;
}

export default function DesignTokensPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const refetchAppearance = useAppearanceStore((s: any) => s.fetch);

  const { data, isLoading } = useQuery<StudioResponse>({
    queryKey: ['design-tokens-studio'],
    queryFn: () => api.get('/design-tokens/studio').then((r: any) => r.data),
  });

  const [studioTab, setStudioTab] = useState<'global' | 'components' | 'landing' | 'roles'>('components');

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftLight, setDraftLight] = useState<Record<string, string>>({});
  const [draftDark, setDraftDark] = useState<Record<string, string>>({});
  const [roleEditable, setRoleEditable] = useState<Record<string, boolean>>({});
  const [roleEditableDirty, setRoleEditableDirty] = useState(false);

  useEffect(() => {
    if (data?.tokens) {
      const init: Record<string, string> = {};
      const light: Record<string, string> = {};
      const dark: Record<string, string> = {};
      for (const t of data.tokens) {
        if (isDualModeThemeToken(t)) {
          light[t.token_key] = effectiveValue(t);
          dark[t.token_key] = effectiveValueDark(t);
        } else {
          init[t.token_key] = effectiveValue(t);
        }
      }
      for (const key of THEME_COLOR_KEYS) {
        if (light[key] === undefined) light[key] = PREVIEW_SEMANTIC_LIGHT[key] ?? '';
        if (dark[key] === undefined) dark[key] = PREVIEW_SEMANTIC_DARK[key] ?? '';
      }
      for (const key of HERO_THEME_KEYS) {
        if (light[key] === undefined) light[key] = PREVIEW_HERO_LIGHT[key] ?? '';
        if (dark[key] === undefined) dark[key] = PREVIEW_HERO_DARK[key] ?? '';
      }
      for (const [key, val] of Object.entries(COMPONENT_STYLE_DEFAULTS)) {
        if (init[key] === undefined) init[key] = val;
      }
      for (const [key, val] of Object.entries(LANDING_STYLE_DEFAULTS)) {
        if (init[key] === undefined) init[key] = val;
      }
      setDraft(init);
      setDraftLight(light);
      setDraftDark(dark);
      const re: Record<string, boolean> = {};
      for (const t of data.tokens) re[t.token_key] = !!t.role_editable;
      setRoleEditable(re);
      setRoleEditableDirty(false);
    }
  }, [data?.tokens]);

  const tokensByCategory = useMemo(() => {
    const map = new Map<string, EditorToken[]>();
    for (const t of data?.tokens || []) {
      // Hide legacy snake_case seed tokens that map to no live CSS var.
      if (!isCssVarToken(t.token_key)) continue;
      if (isComponentStyleToken(t.token_key)) continue;
      if (isLandingStyleToken(t.token_key)) continue;
      if (isDualModeThemeToken(t)) continue;
      if ((HERO_THEME_KEYS as readonly string[]).includes(t.token_key)) continue;
      const cat = t.category || 'other';
      if (cat.startsWith('landing')) continue;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return map;
  }, [data?.tokens]);

  const knownCats = new Set(TOKEN_GROUPS.map((g: any) => g.category));
  const otherCats = [...tokensByCategory.keys()].filter((c: any) => !knownCats.has(c));

  const tokenByKey = useMemo(() => {
    const m = new Map<string, EditorToken>();
    for (const t of data?.tokens || []) m.set(t.token_key, t);
    return m;
  }, [data?.tokens]);

  const dirtyCount = useMemo(() => {
    if (!data?.tokens) return 0;
    let n = 0;
    for (const key of [...THEME_COLOR_KEYS, ...HERO_THEME_KEYS]) {
      const t = tokenByKey.get(key);
      const lightDefaults = (HERO_THEME_KEYS as readonly string[]).includes(key) ? PREVIEW_HERO_LIGHT : PREVIEW_SEMANTIC_LIGHT;
      const darkDefaults = (HERO_THEME_KEYS as readonly string[]).includes(key) ? PREVIEW_HERO_DARK : PREVIEW_SEMANTIC_DARK;
      const pubL = t ? publishedValue(t) : lightDefaults[key] ?? '';
      const pubD = t ? publishedValueDark(t) : darkDefaults[key] ?? '';
      if ((draftLight[key] ?? '') !== pubL) n++;
      if ((draftDark[key] ?? '') !== pubD) n++;
    }
    for (const t of data.tokens) {
      if (isDualModeThemeToken(t)) continue;
      if (draft[t.token_key] !== undefined && draft[t.token_key] !== publishedValue(t)) n++;
    }
    return n;
  }, [data?.tokens, draft, draftLight, draftDark, tokenByKey]);

  const buildPayload = () => {
    const tokens: Record<string, string | null> = {};
    const tokensDark: Record<string, string | null> = {};
    for (const key of [...THEME_COLOR_KEYS, ...HERO_THEME_KEYS]) {
      const t = tokenByKey.get(key);
      const lv = draftLight[key];
      const dv = draftDark[key];
      const lightDefaults = (HERO_THEME_KEYS as readonly string[]).includes(key) ? PREVIEW_HERO_LIGHT : PREVIEW_SEMANTIC_LIGHT;
      const darkDefaults = (HERO_THEME_KEYS as readonly string[]).includes(key) ? PREVIEW_HERO_DARK : PREVIEW_SEMANTIC_DARK;
      const pubL = t ? publishedValue(t) : lightDefaults[key] ?? '';
      const pubD = t ? publishedValueDark(t) : darkDefaults[key] ?? '';
      if (lv !== undefined && lv !== pubL) tokens[key] = lv;
      else if (t?.draft_value != null) tokens[key] = null;
      if (dv !== undefined && dv !== pubD) tokensDark[key] = dv;
      else if (t?.draft_value_dark != null) tokensDark[key] = null;
    }
    for (const t of data?.tokens || []) {
      if (isDualModeThemeToken(t)) continue;
      const local = draft[t.token_key];
      if (local === undefined) continue;
      if (local !== publishedValue(t)) tokens[t.token_key] = local;
      else if (t.draft_value != null) tokens[t.token_key] = null;
    }
    return { tokens, tokensDark };
  };

  const payloadChangeCount = () => {
    const { tokens, tokensDark } = buildPayload();
    return Object.keys(tokens).length + Object.keys(tokensDark).length;
  };

  const handleSaveDraft = () => {
    if (busy) {
      showToast('Please wait — save or publish is already in progress.', 'info');
      return;
    }
    if (dirtyCount === 0) {
      showToast('No unsaved changes. Edit a color or style, then save draft.', 'info');
      return;
    }
    const n = payloadChangeCount();
    if (n === 0) {
      showToast('Nothing to send to the server. Try changing a value again.', 'warning');
      return;
    }
    showToast(`Saving ${n} change${n === 1 ? '' : 's'}…`, 'info');
    saveMutation.mutate();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      const n = Object.keys(payload.tokens).length + Object.keys(payload.tokensDark).length;
      await api.put('/design-tokens/theme', payload);
      return n;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['design-tokens-studio'] });
      showToast(
        n > 0
          ? `Draft saved (${n} token${n === 1 ? '' : 's'}). Publish when ready to go live.`
          : 'Draft saved.',
      );
    },
    onError: (err: any) => showToast('Failed to save draft: ' + getErrorMessage(err), 'error'),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      // Persist on-screen edits as drafts first, then promote them live.
      const { tokens, tokensDark } = buildPayload();
      await api.put('/design-tokens/theme', { tokens, tokensDark });
      return api.post('/design-tokens/publish', {});
    },
    onSuccess: async () => {
      await refetchAppearance();
      qc.invalidateQueries({ queryKey: ['design-tokens-studio'] });
      showToast('Theme published live');
    },
    onError: (err: any) => showToast('Failed to publish: ' + getErrorMessage(err), 'error'),
  });

  const saveRoleEditableMutation = useMutation({
    mutationFn: () => api.put('/design-tokens/role-editable', { tokens: roleEditable }),
    onSuccess: () => {
      setRoleEditableDirty(false);
      qc.invalidateQueries({ queryKey: ['design-tokens-studio'] });
      showToast('Role customization rules saved');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Failed to save'), 'error'),
  });

  const saveBaselineMutation = useMutation({
    mutationFn: () => api.post('/design-tokens/reset-baseline', { label: 'Reset default' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['design-tokens-studio'] });
      showToast('Saved as reset default');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Failed'), 'error'),
  });

  const restoreBaselineMutation = useMutation({
    mutationFn: () => api.post('/design-tokens/restore-baseline', {}),
    onSuccess: async () => {
      await refetchAppearance();
      qc.invalidateQueries({ queryKey: ['design-tokens-studio'] });
      showToast('Restored reset default theme');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Failed'), 'error'),
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: number) => api.post(`/design-tokens/rollback/${versionId}`, {}),
    onSuccess: async () => {
      await refetchAppearance();
      qc.invalidateQueries({ queryKey: ['design-tokens-studio'] });
      showToast('Reverted to selected version');
    },
    onError: (err: any) => showToast('Failed to revert: ' + getErrorMessage(err), 'error'),
  });

  const setValue = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const resetToken = (t: EditorToken) => setValue(t.token_key, t.default_value);
  const onRoleEditableChange = (key: string, enabled: boolean) => {
    setRoleEditable((r) => ({ ...r, [key]: enabled }));
    setRoleEditableDirty(true);
  };

  // Inline CSS vars scoped to the preview pane so the rest of the admin UI stays
  // stable until the admin actually publishes.
  const busy = saveMutation.isPending || publishMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text)]">Appearance Studio</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Global brand tokens and per-component styling (buttons, inputs, selects, cards, and more). Publish to apply app-wide.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && <Badge variant="warning">{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</Badge>}
          <Can permission="design-tokens.edit">
            <Button variant="secondary" size="sm" loading={saveMutation.isPending} disabled={busy}
              onClick={handleSaveDraft}>Save draft</Button>
          </Can>
          <Can permission="design-tokens.publish">
            <Button size="sm" loading={publishMutation.isPending} disabled={busy}
              onClick={() => { if (confirm('Publish this theme to all users?')) publishMutation.mutate(); }}>Publish</Button>
          </Can>
          <Can permission="design-tokens.edit">
            {roleEditableDirty && (
              <Button variant="secondary" size="sm" loading={saveRoleEditableMutation.isPending}
                onClick={() => saveRoleEditableMutation.mutate()}>Save role access</Button>
            )}
            <Button variant="ghost" size="sm" loading={saveBaselineMutation.isPending}
              onClick={() => { if (confirm('Save the current published theme as the reset default?')) saveBaselineMutation.mutate(); }}>
              Set reset default
            </Button>
            {data?.resetBaseline && (
              <Button variant="ghost" size="sm" loading={restoreBaselineMutation.isPending}
                onClick={() => { if (confirm('Restore the entire live theme from reset default?')) restoreBaselineMutation.mutate(); }}>
                Reset to default
              </Button>
            )}
          </Can>
        </div>
      </div>
      {data?.resetBaseline && (
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Reset default saved {new Date(data.resetBaseline.saved_at).toLocaleString()}
          {data.resetBaseline.saved_by_name ? ` by ${data.resetBaseline.saved_by_name}` : ''}
        </p>
      )}

      {isLoading && <div className="text-xs text-[var(--color-text-muted)]">Loading…</div>}

      <div className="flex gap-1 p-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] w-fit">
        <button
          type="button"
          onClick={() => setStudioTab('components')}
          className={`px-4 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
            studioTab === 'components'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          Components
        </button>
        <button
          type="button"
          onClick={() => setStudioTab('landing')}
          className={`px-4 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
            studioTab === 'landing'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          Landing
        </button>
        <button
          type="button"
          onClick={() => setStudioTab('global')}
          className={`px-4 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
            studioTab === 'global'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          Global tokens
        </button>
        <button
          type="button"
          onClick={() => setStudioTab('roles')}
          className={`px-4 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
            studioTab === 'roles'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          Role themes
        </button>
      </div>

      {studioTab === 'components' ? (
        <ComponentStudioPanel
          tokens={data?.tokens || []}
          draft={draft}
          draftLight={draftLight}
          draftDark={draftDark}
          setValue={setValue}
          resetToken={resetToken}
          roleEditable={roleEditable}
          onRoleEditableChange={onRoleEditableChange}
        />
      ) : studioTab === 'landing' ? (
        <LandingStudioPanel
          tokens={data?.tokens || []}
          draft={draft}
          draftLight={draftLight}
          draftDark={draftDark}
          setValue={setValue}
          setLight={(key, value) => setDraftLight((d) => ({ ...d, [key]: value }))}
          setDark={(key, value) => setDraftDark((d) => ({ ...d, [key]: value }))}
          resetToken={resetToken}
          roleEditable={roleEditable}
          onRoleEditableChange={onRoleEditableChange}
          publishedLight={publishedValue}
          publishedDark={publishedValueDark}
        />
      ) : studioTab === 'roles' ? (
        <RoleThemesPanel tokens={data?.tokens || []} draft={draft} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Editor */}
        <div className="lg:col-span-2 space-y-4">
          <ColorSchemePanel
            tokens={data?.tokens || []}
            draftLight={draftLight}
            draftDark={draftDark}
            setLight={(key, value) => setDraftLight((d) => ({ ...d, [key]: value }))}
            setDark={(key, value) => setDraftDark((d) => ({ ...d, [key]: value }))}
            publishedLight={publishedValue}
            publishedDark={publishedValueDark}
          />
          {TOKEN_GROUPS.map((group: any) => {
            const tokens = tokensByCategory.get(group.category)?.filter(
              (t) => t.token_key !== 'gradient-hero',
            );
            if (!tokens?.length) return null;
            return (
              <Card key={group.category} className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">{group.label}</h2>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{group.description}</p>
                </div>
                <StylePropertyRowHeader />
                <div>
                  {tokens.map((t: any) => (
                    <TokenRow key={t.token_key} token={t} value={draft[t.token_key] ?? ''} onChange={setValue} onReset={resetToken}
                      roleEditable={!!roleEditable[t.token_key]} onRoleEditableChange={onRoleEditableChange} />
                  ))}
                </div>
              </Card>
            );
          })}
          {otherCats.map((cat: any) => (
            <Card key={cat} className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)] capitalize">{cat}</h2>
              <StylePropertyRowHeader />
              <div>
                {tokensByCategory.get(cat)!.map((t: any) => (
                  <TokenRow key={t.token_key} token={t} value={draft[t.token_key] ?? ''} onChange={setValue} onReset={resetToken}
                    roleEditable={!!roleEditable[t.token_key]} onRoleEditableChange={onRoleEditableChange} />
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="min-w-0">
          <StickyPreviewPanel title="Live Preview">
            <ThemePreviewPane draft={draft} draftLight={draftLight} draftDark={draftDark} showAllComponents />
          </StickyPreviewPanel>
        </div>
        </div>
      )}

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Version History</h2>
        {(data?.versions?.length ?? 0) === 0 && (
          <p className="text-[11px] text-[var(--color-text-muted)]">No published versions yet.</p>
        )}
        <ul className="space-y-1">
          {data?.versions?.map((v: ThemeVersion) => (
            <li key={v.id} className="flex items-center justify-between gap-2 text-xs border-b border-[var(--color-border)] last:border-0 py-1.5">
              <div className="min-w-0">
                <div className="text-[var(--color-text)] truncate">{v.label || `Version ${v.id}`}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  {new Date(v.published_at).toLocaleString()}
                  {v.published_by_name ? ` • ${v.published_by_name}` : ''}
                </div>
              </div>
              <Can permission="design-tokens.rollback">
                <Button variant="ghost" size="sm" disabled={rollbackMutation.isPending}
                  onClick={() => { if (confirm('Revert the live theme to this version?')) rollbackMutation.mutate(v.id); }}>Revert</Button>
              </Can>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function TokenRow({ token, value, onChange, onReset, roleEditable, onRoleEditableChange }: {
  token: EditorToken;
  value: string;
  onChange: (key: string, value: string) => void;
  onReset: (t: EditorToken) => void;
  roleEditable: boolean;
  onRoleEditableChange: (key: string, enabled: boolean) => void;
}) {
  const isDirty = value !== publishedValue(token);
  const label =
    token.category === 'gradient'
      ? gradientLabel(token.token_key)
      : token.description || token.token_key;

  if (token.category === 'gradient') {
    return (
      <div className="py-3 border-b border-[var(--color-border)] last:border-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[var(--color-text)]">{label}</span>
              {isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] shrink-0" title="Unsaved" />
              )}
            </div>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{token.token_key}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RoleEditableCheckbox
              checked={roleEditable}
              onChange={(v) => onRoleEditableChange(token.token_key, v)}
            />
            <ResetTokenButton onClick={() => onReset(token)} />
          </div>
        </div>
        <TokenControl token={token} value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <StylePropertyRow
      label={label}
      tokenKey={token.token_key}
      isDirty={isDirty}
      roleEditable={roleEditable}
      onRoleEditableChange={(v) => onRoleEditableChange(token.token_key, v)}
      control={<TokenControl token={token} value={value} onChange={onChange} />}
      onReset={() => onReset(token)}
    />
  );
}

function TokenControl({ token, value, onChange }: {
  token: EditorToken;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  const key = token.token_key;
  const inputClass = 'px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white dark:bg-gray-800 text-xs text-[var(--color-text)]';

  if (token.token_type === 'color') {
    return <ColorPickerField value={value} onChange={(v) => onChange(key, v)} />;
  }

  if (token.token_type === 'radius') {
    const px = parseInt(value, 10);
    return (
      <div className="flex items-center gap-1.5">
        <input type="range" min={0} max={40} value={Number.isNaN(px) ? 0 : px}
          onChange={(e: any) => onChange(key, `${e.target.value}px`)}
          onInput={(e: any) => onChange(key, `${e.target.value}px`)}
          className="w-20 accent-[var(--color-primary)]" />
        <input value={value} onChange={(e: any) => onChange(key, e.target.value)} className={`w-16 font-mono ${inputClass}`} />
      </div>
    );
  }

  if (key === GOOGLE_FONT_TOKEN_KEY) {
    return (
      <select value={value} onChange={(e: any) => onChange(key, e.target.value)} className={`w-40 ${inputClass}`}>
        <option value="">None / system</option>
        {GOOGLE_FONTS.map((f: any) => <option key={f} value={f}>{f}</option>)}
      </select>
    );
  }

  if (token.category === 'gradient' || key.startsWith('gradient-')) {
    return (
      <GradientPickerField
        tokenKey={key}
        value={value}
        onChange={(v) => onChange(key, v)}
      />
    );
  }

  // font stacks, shadows and other free-form values
  return (
    <input value={value} onChange={(e: any) => onChange(key, e.target.value)} className={`w-48 font-mono ${inputClass}`} />
  );
}
