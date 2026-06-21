import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import {
  COMPONENT_DEFINITIONS,
  type ComponentStyleDefinition,
} from '../../../theme/component-styles';

export function ComponentPreview({ componentId }: { componentId: string }) {
  switch (componentId) {
    case 'button':
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
        </div>
      );
    case 'input':
      return (
        <div className="space-y-3 max-w-sm">
          <Input label="Email" placeholder="you@example.com" />
          <Input label="With error" error="Required field" placeholder="…" />
        </div>
      );
    case 'textarea':
      return (
        <div className="max-w-sm">
          <Input tag="textarea" label="Description" placeholder="Multi-line text…" rows={4} />
        </div>
      );
    case 'select':
      return (
        <div className="max-w-sm space-y-2">
          <label className="cz-form-label block">Country</label>
          <select className="cz-form-select w-full">
            <option>Egypt</option>
            <option>UAE</option>
            <option>Saudi Arabia</option>
          </select>
        </div>
      );
    case 'badge':
      return (
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Error</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      );
    case 'card':
      return (
        <Card className="max-w-xs">
          <p className="text-sm text-[var(--color-text)] font-medium">Card title</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Surface, padding, radius and shadow from tokens.</p>
        </Card>
      );
    case 'modal':
      return (
        <div className="relative rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden max-w-xs">
          <div className="cz-modal-overlay absolute inset-0" />
          <div className="relative cz-modal-panel bg-[var(--color-surface)] m-4 shadow-[var(--shadow-lg)]">
            <p className="cz-modal-title font-semibold text-[var(--color-text)]">Modal title</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">Dialog padding and corner radius.</p>
            <Button size="sm" className="mt-3">
              OK
            </Button>
          </div>
        </div>
      );
    case 'table':
      return (
        <table className="cz-table w-full border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
          <thead className="bg-[var(--color-surface)]">
            <tr>
              <th className="text-left text-[var(--color-text)]">Name</th>
              <th className="text-left text-[var(--color-text)]">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--color-border)]">
              <td className="text-[var(--color-text)]">Court A</td>
              <td>
                <Badge variant="success">Active</Badge>
              </td>
            </tr>
            <tr className="border-t border-[var(--color-border)]">
              <td className="text-[var(--color-text)]">Court B</td>
              <td>
                <Badge variant="warning">Pending</Badge>
              </td>
            </tr>
          </tbody>
        </table>
      );
    case 'checkbox':
      return (
        <div className="flex flex-col gap-2 text-sm text-[var(--color-text)]">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="cz-checkbox" defaultChecked />
            Remember me
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="cz-checkbox" />
            Email notifications
          </label>
        </div>
      );
    case 'radio':
      return (
        <div className="flex flex-col gap-2 text-sm text-[var(--color-text)]">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="preview-radio" className="cz-radio" defaultChecked />
            Option A
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="preview-radio" className="cz-radio" />
            Option B
          </label>
        </div>
      );
    case 'switch':
      return (
        <div className="flex items-center gap-4">
          <button type="button" className="cz-switch" aria-pressed="false" tabIndex={-1}>
            <span className="cz-switch-thumb" />
          </button>
          <button type="button" className="cz-switch" aria-pressed="true" tabIndex={-1}>
            <span className="cz-switch-thumb" />
          </button>
          <span className="text-xs text-[var(--color-text-muted)]">Off / On</span>
        </div>
      );
    case 'link':
      return (
        <p className="text-sm text-[var(--color-text)]">
          Read the <a href="#preview" className="cz-link" onClick={(e) => e.preventDefault()}>terms of service</a> and{' '}
          <a href="#preview" className="cz-link" onClick={(e) => e.preventDefault()}>privacy policy</a>.
        </p>
      );
    case 'heading':
      return (
        <div className="space-y-1">
          <h1 className="cz-heading-h1">Page title</h1>
          <h2 className="cz-heading-h2">Section heading</h2>
          <h3 className="cz-heading-h3">Subsection</h3>
        </div>
      );
    case 'sidebar':
      return (
        <nav className="cz-sidebar-preview" aria-label="Sidebar preview">
          <div className="cz-sidebar-item is-active">Dashboard</div>
          <div className="cz-sidebar-item">Bookings</div>
          <div className="cz-sidebar-item">Settings</div>
        </nav>
      );
    case 'toast':
      return (
        <div className="cz-toast-preview">
          <p className="font-medium text-[var(--color-text)]">Saved successfully</p>
          <p className="text-[var(--color-text-muted)] mt-0.5 text-[length:var(--toast-font-size)]">Your changes were applied.</p>
        </div>
      );
    case 'tabs':
      return (
        <div className="cz-tabs" role="tablist">
          <span className="cz-tabs-item is-active" role="tab">
            Overview
          </span>
          <span className="cz-tabs-item" role="tab">
            Details
          </span>
          <span className="cz-tabs-item" role="tab">
            History
          </span>
        </div>
      );
    case 'pagination':
      return (
        <div className="cz-pagination" aria-label="Pagination preview">
          <span className="cz-pagination-item">‹</span>
          <span className="cz-pagination-item is-active">1</span>
          <span className="cz-pagination-item">2</span>
          <span className="cz-pagination-item">3</span>
          <span className="cz-pagination-item">›</span>
        </div>
      );
    case 'spinner':
      return (
        <div className="flex items-center gap-3">
          <div className="cz-spinner" aria-hidden />
          <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
        </div>
      );
    case 'file':
      return (
        <div className="cz-file-preview">
          <button type="button" className="cz-file-preview-btn" tabIndex={-1}>
            Choose file
          </button>
          <span>No file chosen</span>
        </div>
      );
    case 'navbar':
      return (
        <header className="cz-navbar-preview">
          CourtZon
          <span>Home</span>
          <span>Bookings</span>
        </header>
      );
    default:
      return <p className="text-xs text-[var(--color-text-muted)]">No preview</p>;
  }
}

export function AllComponentsPreview() {
  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {COMPONENT_DEFINITIONS.map((def) => (
        <div key={def.id}>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">{def.label}</p>
          <ComponentPreview componentId={def.id} />
        </div>
      ))}
    </div>
  );
}

export function componentLabel(def: ComponentStyleDefinition): string {
  return def.label;
}
