import { useMemo, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import {
  LANDING_BLOCK_DEFINITIONS,
  LANDING_STYLE_DEFAULTS,
  isLandingStyleToken,
} from '../../../theme/landing-styles';
import type { ComponentStyleDefinition } from '../../../theme/component-styles';
import { effectiveValue, type EditorToken } from '../../../theme/tokens';
import { StylePropertyRow, StylePropertyRowHeader } from './StylePropertyRow';
import { VisualStyleControl } from './VisualStyleControl';
import { ThemePreviewPane } from './ThemePreviewPane';
import { StickyPreviewPanel } from './StickyPreviewPanel';
import { HeroThemePanel } from './HeroThemePanel';
import { landingPreviewLabel } from './LandingBlockPreview';

function publishedValue(t: EditorToken): string {
  return t.current_value ?? t.default_value;
}

export function LandingStudioPanel({
  tokens,
  draft,
  draftLight = {},
  draftDark = {},
  setValue,
  setLight,
  setDark,
  resetToken,
  roleEditable,
  onRoleEditableChange,
  publishedLight,
  publishedDark,
}: {
  tokens: EditorToken[];
  draft: Record<string, string>;
  draftLight?: Record<string, string>;
  draftDark?: Record<string, string>;
  setValue: (key: string, value: string) => void;
  setLight: (key: string, value: string) => void;
  setDark: (key: string, value: string) => void;
  resetToken: (t: EditorToken) => void;
  roleEditable: Record<string, boolean>;
  onRoleEditableChange: (key: string, enabled: boolean) => void;
  publishedLight: (t: EditorToken) => string;
  publishedDark: (t: EditorToken) => string;
}) {
  const [activeId, setActiveId] = useState(LANDING_BLOCK_DEFINITIONS[0]?.id ?? 'hero');

  const tokenByKey = useMemo(() => {
    const map = new Map<string, EditorToken>();
    for (const t of tokens) {
      if (isLandingStyleToken(t.token_key)) map.set(t.token_key, t);
    }
    return map;
  }, [tokens]);

  const activeDef = LANDING_BLOCK_DEFINITIONS.find((b) => b.id === activeId);
  const showHeroColors = activeId === 'hero' || activeId === 'cta';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <div className="lg:col-span-3 space-y-1">
        {LANDING_BLOCK_DEFINITIONS.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => setActiveId(def.id)}
            className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors ${
              activeId === def.id
                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium'
                : 'text-[var(--color-text)] hover:bg-[var(--color-surface)]'
            }`}
          >
            {def.label}
          </button>
        ))}
      </div>

      <div className="lg:col-span-5 space-y-4">
        {showHeroColors && (
          <HeroThemePanel
            tokens={tokens}
            draftLight={draftLight}
            draftDark={draftDark}
            setLight={setLight}
            setDark={setDark}
            publishedLight={publishedLight}
            publishedDark={publishedDark}
          />
        )}
        {activeDef && (
          <LandingEditorCard
            def={activeDef}
            tokenByKey={tokenByKey}
            draft={draft}
            setValue={setValue}
            resetToken={resetToken}
            roleEditable={roleEditable}
            onRoleEditableChange={onRoleEditableChange}
          />
        )}
      </div>

      <div className="lg:col-span-4 min-w-0">
        <StickyPreviewPanel title={`Preview — ${landingPreviewLabel(activeId)}`}>
          <ThemePreviewPane
            draft={draft}
            draftLight={draftLight}
            draftDark={draftDark}
            landingBlockId={activeId}
          />
        </StickyPreviewPanel>
      </div>
    </div>
  );
}

function LandingEditorCard({
  def,
  tokenByKey,
  draft,
  setValue,
  resetToken,
  roleEditable,
  onRoleEditableChange,
}: {
  def: ComponentStyleDefinition;
  tokenByKey: Map<string, EditorToken>;
  draft: Record<string, string>;
  setValue: (key: string, value: string) => void;
  resetToken: (t: EditorToken) => void;
  roleEditable: Record<string, boolean>;
  onRoleEditableChange: (key: string, enabled: boolean) => void;
}) {
  const seen = new Set<string>();
  const properties = def.properties.filter((p) => {
    if (seen.has(p.tokenKey)) return false;
    seen.add(p.tokenKey);
    return true;
  });

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">{def.label}</h2>
        <p className="text-[11px] text-[var(--color-text-muted)]">{def.description}</p>
      </div>
      <StylePropertyRowHeader />
      <div>
        {properties.map((prop) => {
          const token = tokenByKey.get(prop.tokenKey);
          const value =
            draft[prop.tokenKey] ??
            (token ? effectiveValue(token) : LANDING_STYLE_DEFAULTS[prop.tokenKey] ?? '');
          const isDirty = token ? value !== publishedValue(token) : false;
          return (
            <StylePropertyRow
              key={prop.tokenKey}
              label={prop.label}
              tokenKey={prop.tokenKey}
              description={prop.description}
              isDirty={isDirty}
              roleEditable={!!roleEditable[prop.tokenKey]}
              onRoleEditableChange={(v) => onRoleEditableChange(prop.tokenKey, v)}
              control={
                <VisualStyleControl meta={prop} value={value} onChange={(v) => setValue(prop.tokenKey, v)} />
              }
              onReset={token ? () => resetToken(token) : undefined}
            />
          );
        })}
      </div>
    </Card>
  );
}
