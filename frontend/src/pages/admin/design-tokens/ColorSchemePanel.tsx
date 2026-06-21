import { Card } from '../../../components/ui/Card';
import {
  PREVIEW_SEMANTIC_DARK,
  PREVIEW_SEMANTIC_LIGHT,
  THEME_COLOR_GROUPS,
  THEME_COLOR_LABELS,
  type EditorToken,
} from '../../../theme/tokens';
import { ColorPickerField } from './ColorPickerField';
import { ResetTokenButton } from './ResetTokenButton';
import { VisualStyleControl } from './VisualStyleControl';
import type { ComponentStyleProperty } from '../../../theme/component-styles';

function shadowMeta(tokenKey: string): ComponentStyleProperty {
  return { tokenKey, label: tokenKey, control: 'shadow' };
}

function isShadowKey(key: string): boolean {
  return key.startsWith('shadow-');
}

export function ColorSchemePanel({
  tokens,
  draftLight,
  draftDark,
  setLight,
  setDark,
  publishedLight,
  publishedDark,
}: {
  tokens: EditorToken[];
  draftLight: Record<string, string>;
  draftDark: Record<string, string>;
  setLight: (key: string, value: string) => void;
  setDark: (key: string, value: string) => void;
  publishedLight: (t: EditorToken) => string;
  publishedDark: (t: EditorToken) => string;
}) {
  const byKey = new Map(tokens.map((t) => [t.token_key, t]));

  const defaultLight = (key: string) => PREVIEW_SEMANTIC_LIGHT[key] ?? '#000000';
  const defaultDark = (key: string) => PREVIEW_SEMANTIC_DARK[key] ?? '#000000';

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Theme colors (light & dark)</h2>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Each row has a <strong className="text-[var(--color-text)]">Light</strong> and{' '}
          <strong className="text-[var(--color-text)]">Dark</strong> swatch. <strong className="text-[var(--color-text)]">Muted text</strong>{' '}
          affects nav links, hints, and secondary labels (not the landing hero — use <strong className="text-[var(--color-text)]">Landing hero</strong>{' '}
          below). Save draft, then Publish.
        </p>
      </Card>

      {THEME_COLOR_GROUPS.map((group) => (
        <Card key={group.label} className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{group.label}</h3>
            <p className="text-[11px] text-[var(--color-text-muted)]">{group.description}</p>
          </div>

          <div className="grid grid-cols-[1fr_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            <span>Property</span>
            <span className="text-center">Light mode</span>
            <span className="text-center">Dark mode</span>
            <span />
          </div>

          <div className="divide-y divide-[var(--color-border)]">
            {group.keys.map((key) => {
              const token = byKey.get(key);
              const lightVal = draftLight[key] ?? defaultLight(key);
              const darkVal = draftDark[key] ?? defaultDark(key);
              const pubLight = token ? publishedLight(token) : defaultLight(key);
              const pubDark = token ? publishedDark(token) : defaultDark(key);
              const lightDirty = lightVal !== pubLight;
              const darkDirty = darkVal !== pubDark;
              const label = token?.description || THEME_COLOR_LABELS[key] || key;

              return (
                <div
                  key={key}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 py-3 items-center"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text)]">{label}</p>
                    <p className="text-[10px] font-mono text-[var(--color-text-muted)]">{key}</p>
                    {(lightDirty || darkDirty) && (
                      <p className="text-[10px] text-[var(--color-primary)]">Unsaved changes</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="sm:hidden text-[10px] uppercase text-[var(--color-text-muted)]">Light mode</span>
                    {isShadowKey(key) ? (
                      <VisualStyleControl
                        meta={shadowMeta(key)}
                        value={lightVal}
                        onChange={(v) => setLight(key, v)}
                      />
                    ) : (
                      <ColorPickerField value={lightVal} onChange={(v) => setLight(key, v)} allowVar={false} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="sm:hidden text-[10px] uppercase text-[var(--color-text-muted)]">Dark mode</span>
                    {isShadowKey(key) ? (
                      <VisualStyleControl
                        meta={shadowMeta(key)}
                        value={darkVal}
                        onChange={(v) => setDark(key, v)}
                      />
                    ) : (
                      <ColorPickerField value={darkVal} onChange={(v) => setDark(key, v)} allowVar={false} />
                    )}
                  </div>
                  <div className="flex items-center sm:justify-end">
                    <ResetTokenButton
                      onClick={() => {
                        setLight(key, pubLight);
                        setDark(key, pubDark);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
