import { Card } from '../../../components/ui/Card';
import { ColorPickerField } from './ColorPickerField';
import { GradientPickerField } from './GradientPickerField';
import { ResetTokenButton } from './ResetTokenButton';
import {
  HERO_THEME_KEYS,
  HERO_THEME_LABELS,
  PREVIEW_HERO_DARK,
  PREVIEW_HERO_LIGHT,
  type EditorToken,
} from '../../../theme/tokens';

export function HeroThemePanel({
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

  const defaultLight = (key: string) => PREVIEW_HERO_LIGHT[key] ?? '';
  const defaultDark = (key: string) => PREVIEW_HERO_DARK[key] ?? '';

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Landing hero (light & dark)</h2>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
          Controls the home hero, CTA, and stats bands. Set a <strong className="text-[var(--color-text)]">light</strong> and{' '}
          <strong className="text-[var(--color-text)]">dark</strong> gradient plus title/subtitle colors so text stays readable
          (fixes grey subtitle on green). Nav links use <code className="font-mono">color-text-muted</code> under Theme colors → Text.
        </p>
      </div>

      <div className="grid grid-cols-[1fr_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
        <span>Property</span>
        <span className="text-center">Light mode</span>
        <span className="text-center">Dark mode</span>
        <span />
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {HERO_THEME_KEYS.map((key) => {
          const token = byKey.get(key);
          const lightVal = draftLight[key] ?? defaultLight(key);
          const darkVal = draftDark[key] ?? defaultDark(key);
          const pubLight = token ? publishedLight(token) : defaultLight(key);
          const pubDark = token ? publishedDark(token) : defaultDark(key);
          const label = HERO_THEME_LABELS[key] || key;
          const isGradient = key === 'gradient-hero';

          return (
            <div
              key={key}
              className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 py-4 items-start"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--color-text)]">{label}</p>
                <p className="text-[10px] font-mono text-[var(--color-text-muted)]">{key}</p>
              </div>
              <div className="min-w-0">
                <span className="lg:hidden text-[10px] uppercase text-[var(--color-text-muted)] mb-1 block">Light</span>
                {isGradient ? (
                  <GradientPickerField tokenKey={key} value={lightVal} onChange={(v) => setLight(key, v)} />
                ) : (
                  <ColorPickerField value={lightVal} onChange={(v) => setLight(key, v)} allowVar={false} />
                )}
              </div>
              <div className="min-w-0">
                <span className="lg:hidden text-[10px] uppercase text-[var(--color-text-muted)] mb-1 block">Dark</span>
                {isGradient ? (
                  <GradientPickerField tokenKey={key} value={darkVal} onChange={(v) => setDark(key, v)} />
                ) : (
                  <ColorPickerField value={darkVal} onChange={(v) => setDark(key, v)} allowVar={false} />
                )}
              </div>
              <div className="flex items-start lg:pt-6">
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
  );
}
