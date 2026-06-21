import { useMemo, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import {
  COMPONENT_DEFINITIONS,
  COMPONENT_STYLE_DEFAULTS,
  isComponentStyleToken,
  type ComponentStyleDefinition,
} from '../../../theme/component-styles';
import { effectiveValue, type EditorToken } from '../../../theme/tokens';
import { StylePropertyRow, StylePropertyRowHeader } from './StylePropertyRow';
import { VisualStyleControl } from './VisualStyleControl';
import { ThemePreviewPane } from './ThemePreviewPane';
import { StickyPreviewPanel } from './StickyPreviewPanel';

function publishedValue(t: EditorToken): string {
  return t.current_value ?? t.default_value;
}

export function ComponentStudioPanel({
  tokens,
  draft,
  draftLight = {},
  draftDark = {},
  setValue,
  resetToken,
  roleEditable,
  onRoleEditableChange,
}: {
  tokens: EditorToken[];
  draft: Record<string, string>;
  draftLight?: Record<string, string>;
  draftDark?: Record<string, string>;
  setValue: (key: string, value: string) => void;
  resetToken: (t: EditorToken) => void;
  roleEditable: Record<string, boolean>;
  onRoleEditableChange: (key: string, enabled: boolean) => void;
}) {
  const [activeId, setActiveId] = useState(COMPONENT_DEFINITIONS[0]?.id ?? 'button');

  const tokenByKey = useMemo(() => {
    const map = new Map<string, EditorToken>();
    for (const t of tokens) {
      if (isComponentStyleToken(t.token_key)) map.set(t.token_key, t);
    }
    return map;
  }, [tokens]);

  const activeDef = COMPONENT_DEFINITIONS.find((c) => c.id === activeId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Component picker */}
      <div className="lg:col-span-3 space-y-1">
        {COMPONENT_DEFINITIONS.map((def) => (
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

      {/* Property editors */}
      <div className="lg:col-span-5 space-y-4">
        {activeDef && (
          <ComponentEditorCard
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
        <StickyPreviewPanel
          title={`Preview — ${activeDef?.label ?? 'Component'}`}
          header={
            <p className="text-[10px] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] bg-[var(--color-primary)]/5 px-2 py-1.5">
              Component colors use a color swatch on each row. Values like{' '}
              <code className="font-mono">var(--color-border)</code> inherit from theme — pick a hex to override. App
              background & text: <strong className="text-[var(--color-text)]">Global tokens → Theme colors</strong>.
            </p>
          }
        >
          <ThemePreviewPane draft={draft} draftLight={draftLight} draftDark={draftDark} componentId={activeId} />
        </StickyPreviewPanel>
      </div>
    </div>
  );
}

function ComponentEditorCard({
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
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">{def.label}</h2>
        <p className="text-[11px] text-[var(--color-text-muted)]">{def.description}</p>
      </div>
      <StylePropertyRowHeader />
      <div>
        {def.properties.map((prop) => {
          const token = tokenByKey.get(prop.tokenKey);
          const value =
            draft[prop.tokenKey] ??
            (token ? effectiveValue(token) : COMPONENT_STYLE_DEFAULTS[prop.tokenKey] ?? '');
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

