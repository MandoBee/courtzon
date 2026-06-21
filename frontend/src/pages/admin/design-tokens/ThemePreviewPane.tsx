import { useMemo } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { mergePreviewStyles, previewVarsToCssBlock } from '../../../theme/tokens';
import { ComponentPreview } from './ComponentPreview';
import { LandingBlockPreview } from './LandingBlockPreview';

export function ThemePreviewPane({
  draft,
  draftLight = {},
  draftDark = {},
  componentId,
  landingBlockId,
  showAllComponents = false,
}: {
  /** Shared tokens (components, brand, fonts, radii). */
  draft: Record<string, string>;
  /** Overrides shown only in the light preview column. */
  draftLight?: Record<string, string>;
  /** Overrides shown only in the dark preview column. */
  draftDark?: Record<string, string>;
  componentId?: string;
  landingBlockId?: string;
  showAllComponents?: boolean;
}) {
  const lightVars = useMemo(() => mergePreviewStyles(draft, 'light', draftLight), [draft, draftLight]);
  const darkVars = useMemo(() => mergePreviewStyles(draft, 'dark', draftDark), [draft, draftDark]);
  const previewCss = useMemo(
    () =>
      `.cz-appearance-preview-light{${previewVarsToCssBlock(lightVars)}}.cz-appearance-preview-dark{${previewVarsToCssBlock(darkVars)}}`,
    [lightVars, darkVars],
  );

  return (
    <div className="space-y-3">
      <style data-cz-appearance-preview>{previewCss}</style>
      <p className="text-[10px] text-[var(--color-text-muted)]">Updates live as you edit values.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5 font-medium">
            Light
          </p>
          <div className="cz-appearance-preview-light rounded-[var(--radius-lg)] border p-4 space-y-3 min-h-[140px] isolation isolate">
            <PreviewContent
              componentId={componentId}
              landingBlockId={landingBlockId}
              showAllComponents={showAllComponents}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5 font-medium">
            Dark
          </p>
          <div className="cz-appearance-preview-dark rounded-[var(--radius-lg)] border p-4 space-y-3 min-h-[140px] isolation isolate">
            <PreviewContent
              componentId={componentId}
              landingBlockId={landingBlockId}
              showAllComponents={showAllComponents}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewContent({
  componentId,
  landingBlockId,
  showAllComponents,
}: {
  componentId?: string;
  landingBlockId?: string;
  showAllComponents?: boolean;
}) {
  if (landingBlockId) {
    return <LandingBlockPreview blockId={landingBlockId} />;
  }
  if (componentId) {
    return <ComponentPreview componentId={componentId} />;
  }
  if (showAllComponents) {
    return (
      <div className="space-y-3 text-sm">
        <div className="cz-heading-h1 font-bold text-[var(--color-text)]">Heading</div>
        <a href="#" className="cz-link" onClick={(e) => e.preventDefault()}>
          Sample link
        </a>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
        </div>
        <Badge variant="success">Badge</Badge>
        <Input placeholder="Input" />
        <select className="w-full">
          <option>Select</option>
        </select>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-[var(--color-text)] font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        Heading
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">Body text sample</p>
      <Button size="sm">Button</Button>
    </div>
  );
}
