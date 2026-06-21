/**
 * Component-level style tokens for Appearance Studio.
 * Each `tokenKey` maps to `--{tokenKey}` in CSS and a row in `design_tokens`.
 */

export type StyleControlType =
  | 'color'
  | 'size'
  | 'radius'
  | 'font-size'
  | 'font-family'
  | 'toggle'
  | 'select'
  | 'shadow'
  | 'weight';

export interface ComponentStyleProperty {
  tokenKey: string;
  label: string;
  control: StyleControlType;
  description?: string;
  /** For `select` controls */
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface ComponentStyleDefinition {
  id: string;
  label: string;
  description: string;
  category: string;
  properties: ComponentStyleProperty[];
}

export const COMPONENT_DEFINITIONS: ComponentStyleDefinition[] = [
  {
    id: 'button',
    label: 'Button',
    description: 'Primary actions — size, font, corners, and padding per size',
    category: 'component-button',
    properties: [
      { tokenKey: 'button-border-radius', label: 'Corner radius', control: 'radius', min: 0, max: 48 },
      { tokenKey: 'button-font-family', label: 'Font family', control: 'font-family' },
      { tokenKey: 'button-font-weight', label: 'Font weight', control: 'weight' },
      { tokenKey: 'button-sm-font-size', label: 'Small — font size', control: 'font-size', min: 10, max: 20 },
      { tokenKey: 'button-sm-padding-x', label: 'Small — padding X', control: 'size', min: 4, max: 32 },
      { tokenKey: 'button-sm-padding-y', label: 'Small — padding Y', control: 'size', min: 2, max: 20 },
      { tokenKey: 'button-md-font-size', label: 'Medium — font size', control: 'font-size', min: 10, max: 22 },
      { tokenKey: 'button-md-padding-x', label: 'Medium — padding X', control: 'size', min: 4, max: 40 },
      { tokenKey: 'button-md-padding-y', label: 'Medium — padding Y', control: 'size', min: 4, max: 24 },
      { tokenKey: 'button-lg-font-size', label: 'Large — font size', control: 'font-size', min: 12, max: 24 },
      { tokenKey: 'button-lg-padding-x', label: 'Large — padding X', control: 'size', min: 8, max: 48 },
      { tokenKey: 'button-lg-padding-y', label: 'Large — padding Y', control: 'size', min: 6, max: 28 },
      { tokenKey: 'button-secondary-border-color', label: 'Secondary border', control: 'color' },
    ],
  },
  {
    id: 'input',
    label: 'Text input',
    description: 'Single-line fields and labels',
    category: 'component-input',
    properties: [
      { tokenKey: 'form-control-height', label: 'Height', control: 'size', min: 28, max: 56 },
      { tokenKey: 'form-control-padding-x', label: 'Padding X', control: 'size', min: 4, max: 32 },
      { tokenKey: 'form-control-font-size', label: 'Font size', control: 'font-size', min: 10, max: 20 },
      { tokenKey: 'form-control-font-family', label: 'Font family', control: 'font-family' },
      { tokenKey: 'form-control-text-color', label: 'Text color', control: 'color' },
      { tokenKey: 'form-control-bg', label: 'Background', control: 'color' },
      { tokenKey: 'form-control-border-color', label: 'Border color', control: 'color' },
      { tokenKey: 'form-control-border-radius', label: 'Corner radius', control: 'radius', min: 0, max: 48 },
      { tokenKey: 'form-control-focus-ring-color', label: 'Focus ring', control: 'color' },
      { tokenKey: 'label-font-size', label: 'Label font size', control: 'font-size', min: 10, max: 18 },
      { tokenKey: 'label-font-color', label: 'Label color', control: 'color' },
      { tokenKey: 'label-font-weight', label: 'Label weight', control: 'weight' },
      { tokenKey: 'hint-font-size', label: 'Hint / error font size', control: 'font-size', min: 10, max: 16 },
    ],
  },
  {
    id: 'textarea',
    label: 'Textarea',
    description: 'Multi-line fields — height and resize behavior',
    category: 'component-textarea',
    properties: [
      { tokenKey: 'textarea-min-height', label: 'Min height', control: 'size', min: 48, max: 320 },
      {
        tokenKey: 'textarea-resize',
        label: 'Resize',
        control: 'select',
        options: [
          { value: 'none', label: 'Fixed (no resize)' },
          { value: 'vertical', label: 'Vertical only' },
          { value: 'both', label: 'Both directions' },
        ],
      },
      { tokenKey: 'textarea-line-height', label: 'Line height', control: 'size', min: 1, max: 2.5, unit: '' },
    ],
  },
  {
    id: 'select',
    label: 'Select',
    description: 'Dropdowns — inherits form colors; size overrides here',
    category: 'component-select',
    properties: [
      { tokenKey: 'select-height', label: 'Height', control: 'size', min: 28, max: 56 },
      { tokenKey: 'select-font-size', label: 'Font size', control: 'font-size', min: 10, max: 20 },
      { tokenKey: 'select-padding-x', label: 'Padding X', control: 'size', min: 4, max: 32 },
      { tokenKey: 'select-border-radius', label: 'Corner radius', control: 'radius', min: 0, max: 48 },
      { tokenKey: 'select-bg', label: 'Background', control: 'color' },
      { tokenKey: 'select-text-color', label: 'Text color', control: 'color' },
      { tokenKey: 'select-border-color', label: 'Border color', control: 'color' },
    ],
  },
  {
    id: 'badge',
    label: 'Badge / pill',
    description: 'Status chips and tags',
    category: 'component-badge',
    properties: [
      { tokenKey: 'badge-font-size', label: 'Font size', control: 'font-size', min: 9, max: 16 },
      { tokenKey: 'badge-padding-x', label: 'Padding X', control: 'size', min: 4, max: 20 },
      { tokenKey: 'badge-padding-y', label: 'Padding Y', control: 'size', min: 0, max: 12 },
      { tokenKey: 'badge-border-radius', label: 'Corner radius', control: 'radius', min: 0, max: 48 },
      { tokenKey: 'badge-font-weight', label: 'Font weight', control: 'weight' },
    ],
  },
  {
    id: 'card',
    label: 'Card',
    description: 'Panels and surfaces',
    category: 'component-card',
    properties: [
      { tokenKey: 'card-padding', label: 'Padding', control: 'size', min: 0, max: 48 },
      { tokenKey: 'card-border-radius', label: 'Corner radius', control: 'radius', min: 0, max: 32 },
      { tokenKey: 'card-border-width', label: 'Border width', control: 'size', min: 0, max: 4 },
      { tokenKey: 'card-border-color', label: 'Border color', control: 'color' },
      { tokenKey: 'card-shadow', label: 'Shadow', control: 'shadow' },
    ],
  },
  {
    id: 'modal',
    label: 'Modal',
    description: 'Dialog panels',
    category: 'component-modal',
    properties: [
      { tokenKey: 'modal-border-radius', label: 'Corner radius', control: 'radius', min: 0, max: 32 },
      { tokenKey: 'modal-padding', label: 'Inner padding', control: 'size', min: 8, max: 48 },
      { tokenKey: 'modal-header-font-size', label: 'Title font size', control: 'font-size', min: 14, max: 28 },
      { tokenKey: 'modal-overlay-opacity', label: 'Backdrop opacity', control: 'size', min: 0, max: 90, unit: '%' },
    ],
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Data tables and list rows',
    category: 'component-table',
    properties: [
      { tokenKey: 'table-cell-padding-x', label: 'Cell padding X', control: 'size', min: 4, max: 24 },
      { tokenKey: 'table-cell-padding-y', label: 'Cell padding Y', control: 'size', min: 4, max: 20 },
      { tokenKey: 'table-font-size', label: 'Font size', control: 'font-size', min: 10, max: 16 },
      { tokenKey: 'table-header-font-weight', label: 'Header weight', control: 'weight' },
      { tokenKey: 'table-row-hover-bg', label: 'Row hover background', control: 'color' },
    ],
  },
  {
    id: 'checkbox',
    label: 'Checkbox',
    description: 'Checkbox inputs',
    category: 'component-checkbox',
    properties: [
      { tokenKey: 'checkbox-size', label: 'Size', control: 'size', min: 12, max: 24 },
      { tokenKey: 'checkbox-border-radius', label: 'Corner radius', control: 'radius', min: 0, max: 12 },
      { tokenKey: 'checkbox-accent-color', label: 'Accent color', control: 'color' },
    ],
  },
  {
    id: 'radio',
    label: 'Radio',
    description: 'Radio button inputs',
    category: 'component-radio',
    properties: [
      { tokenKey: 'radio-size', label: 'Size', control: 'size', min: 12, max: 24 },
      { tokenKey: 'radio-accent-color', label: 'Accent color', control: 'color' },
    ],
  },
  {
    id: 'switch',
    label: 'Toggle switch',
    description: 'On/off switches',
    category: 'component-switch',
    properties: [
      { tokenKey: 'switch-width', label: 'Track width', control: 'size', min: 32, max: 56 },
      { tokenKey: 'switch-height', label: 'Track height', control: 'size', min: 16, max: 32 },
      { tokenKey: 'switch-thumb-size', label: 'Thumb size', control: 'size', min: 14, max: 28 },
      { tokenKey: 'switch-on-color', label: 'On color', control: 'color' },
      { tokenKey: 'switch-off-color', label: 'Off color', control: 'color' },
    ],
  },
  {
    id: 'link',
    label: 'Link',
    description: 'Text links',
    category: 'component-link',
    properties: [
      { tokenKey: 'link-font-size', label: 'Font size', control: 'font-size', min: 10, max: 20 },
      { tokenKey: 'link-color', label: 'Color', control: 'color' },
      { tokenKey: 'link-hover-color', label: 'Hover color', control: 'color' },
      { tokenKey: 'link-font-weight', label: 'Font weight', control: 'weight' },
    ],
  },
  {
    id: 'heading',
    label: 'Headings',
    description: 'Page and section titles',
    category: 'component-heading',
    properties: [
      { tokenKey: 'heading-h1-size', label: 'H1 size', control: 'font-size', min: 20, max: 48 },
      { tokenKey: 'heading-h2-size', label: 'H2 size', control: 'font-size', min: 18, max: 36 },
      { tokenKey: 'heading-h3-size', label: 'H3 size', control: 'font-size', min: 16, max: 28 },
      { tokenKey: 'heading-font-family', label: 'Font family', control: 'font-family' },
      { tokenKey: 'heading-color', label: 'Color', control: 'color' },
      { tokenKey: 'heading-font-weight', label: 'Font weight', control: 'weight' },
    ],
  },
  {
    id: 'sidebar',
    label: 'Sidebar',
    description: 'Navigation sidebar',
    category: 'component-sidebar',
    properties: [
      { tokenKey: 'sidebar-width', label: 'Width', control: 'size', min: 200, max: 320 },
      { tokenKey: 'sidebar-bg', label: 'Background', control: 'color' },
      { tokenKey: 'sidebar-item-padding-x', label: 'Item padding X', control: 'size', min: 4, max: 24 },
      { tokenKey: 'sidebar-item-padding-y', label: 'Item padding Y', control: 'size', min: 4, max: 20 },
      { tokenKey: 'sidebar-item-radius', label: 'Item radius', control: 'radius', min: 0, max: 24 },
      { tokenKey: 'sidebar-active-bg', label: 'Active background', control: 'color' },
      { tokenKey: 'sidebar-active-color', label: 'Active text', control: 'color' },
    ],
  },
  {
    id: 'toast',
    label: 'Toast',
    description: 'Notification toasts',
    category: 'component-toast',
    properties: [
      { tokenKey: 'toast-padding', label: 'Padding', control: 'size', min: 8, max: 32 },
      { tokenKey: 'toast-radius', label: 'Corner radius', control: 'radius', min: 0, max: 24 },
      { tokenKey: 'toast-font-size', label: 'Font size', control: 'font-size', min: 10, max: 18 },
      { tokenKey: 'toast-shadow', label: 'Shadow', control: 'shadow' },
    ],
  },
  {
    id: 'tabs',
    label: 'Tabs',
    description: 'Tab navigation',
    category: 'component-tabs',
    properties: [
      { tokenKey: 'tabs-font-size', label: 'Font size', control: 'font-size', min: 10, max: 18 },
      { tokenKey: 'tabs-padding-x', label: 'Padding X', control: 'size', min: 8, max: 32 },
      { tokenKey: 'tabs-padding-y', label: 'Padding Y', control: 'size', min: 4, max: 20 },
      { tokenKey: 'tabs-active-color', label: 'Active color', control: 'color' },
      { tokenKey: 'tabs-border-color', label: 'Border color', control: 'color' },
    ],
  },
  {
    id: 'pagination',
    label: 'Pagination',
    description: 'Page controls',
    category: 'component-pagination',
    properties: [
      { tokenKey: 'pagination-font-size', label: 'Font size', control: 'font-size', min: 10, max: 18 },
      { tokenKey: 'pagination-item-size', label: 'Item size', control: 'size', min: 28, max: 48 },
      { tokenKey: 'pagination-active-bg', label: 'Active background', control: 'color' },
      { tokenKey: 'pagination-active-color', label: 'Active text', control: 'color' },
    ],
  },
  {
    id: 'spinner',
    label: 'Spinner',
    description: 'Loading indicators',
    category: 'component-spinner',
    properties: [
      { tokenKey: 'spinner-size', label: 'Size', control: 'size', min: 16, max: 64 },
      { tokenKey: 'spinner-color', label: 'Color', control: 'color' },
    ],
  },
  {
    id: 'file',
    label: 'File input',
    description: 'Upload file button',
    category: 'component-file',
    properties: [
      { tokenKey: 'file-button-radius', label: 'Button radius', control: 'radius', min: 0, max: 48 },
      { tokenKey: 'file-button-padding-x', label: 'Button padding X', control: 'size', min: 8, max: 32 },
      { tokenKey: 'file-button-padding-y', label: 'Button padding Y', control: 'size', min: 4, max: 20 },
    ],
  },
  {
    id: 'navbar',
    label: 'Navbar',
    description: 'Top navigation bar',
    category: 'component-navbar',
    properties: [
      { tokenKey: 'navbar-height', label: 'Height', control: 'size', min: 44, max: 80 },
      { tokenKey: 'navbar-bg', label: 'Background', control: 'color' },
      { tokenKey: 'navbar-border-color', label: 'Border color', control: 'color' },
    ],
  },
];

const componentTokenKeySet = new Set(
  COMPONENT_DEFINITIONS.flatMap((c) => c.properties.map((p) => p.tokenKey)),
);

export function isComponentStyleToken(tokenKey: string): boolean {
  return componentTokenKeySet.has(tokenKey);
}

export function getComponentDefinition(id: string): ComponentStyleDefinition | undefined {
  return COMPONENT_DEFINITIONS.find((c) => c.id === id);
}

export function getPropertyMeta(tokenKey: string): ComponentStyleProperty | undefined {
  for (const def of COMPONENT_DEFINITIONS) {
    const prop = def.properties.find((p) => p.tokenKey === tokenKey);
    if (prop) return prop;
  }
  return undefined;
}

/** Default values — mirrored in index.css :root and migration seed */
export const COMPONENT_STYLE_DEFAULTS: Record<string, string> = {
  'button-border-radius': 'var(--radius-md)',
  'button-font-family': 'var(--font-body)',
  'button-font-weight': '500',
  'button-sm-font-size': '14px',
  'button-sm-padding-x': '12px',
  'button-sm-padding-y': '6px',
  'button-md-font-size': '14px',
  'button-md-padding-x': '16px',
  'button-md-padding-y': '10px',
  'button-lg-font-size': '16px',
  'button-lg-padding-x': '24px',
  'button-lg-padding-y': '12px',
  'button-secondary-border-color': 'var(--color-border)',
  'form-control-height': '42px',
  'form-control-padding-x': '16px',
  'form-control-font-size': '14px',
  'form-control-font-family': 'var(--font-body)',
  'form-control-text-color': 'var(--color-text)',
  'form-control-bg': 'var(--color-surface)',
  'form-control-border-color': 'var(--color-border)',
  'form-control-border-radius': 'var(--radius-md)',
  'form-control-focus-ring-color': 'var(--color-primary)',
  'label-font-size': '14px',
  'label-font-color': 'var(--color-text)',
  'label-font-weight': '500',
  'hint-font-size': '14px',
  'textarea-min-height': '96px',
  'textarea-resize': 'none',
  'textarea-line-height': '1.5',
  'select-height': '42px',
  'select-font-size': '14px',
  'select-padding-x': '12px',
  'select-border-radius': 'var(--radius-md)',
  'select-bg': 'var(--color-surface)',
  'select-text-color': 'var(--color-text)',
  'select-border-color': 'var(--color-border)',
  'badge-font-size': '12px',
  'badge-padding-x': '10px',
  'badge-padding-y': '2px',
  'badge-border-radius': '9999px',
  'badge-font-weight': '500',
  'card-padding': '24px',
  'card-border-radius': 'var(--radius-lg)',
  'card-border-width': '0px',
  'card-border-color': 'var(--color-border)',
  'card-shadow': 'var(--shadow-md)',
  'modal-border-radius': 'var(--radius-lg)',
  'modal-padding': '24px',
  'modal-header-font-size': '18px',
  'table-cell-padding-x': '12px',
  'table-cell-padding-y': '10px',
  'table-font-size': '14px',
  'table-header-font-weight': '600',
  'table-row-hover-bg': 'var(--color-primary-bg)',
  'checkbox-size': '16px',
  'checkbox-border-radius': '4px',
  'checkbox-accent-color': 'var(--color-primary)',
  'radio-size': '16px',
  'radio-accent-color': 'var(--color-primary)',
  'switch-width': '44px',
  'switch-height': '24px',
  'switch-thumb-size': '20px',
  'switch-on-color': 'var(--color-primary)',
  'switch-off-color': 'var(--color-border)',
  'link-font-size': '14px',
  'link-color': 'var(--color-primary)',
  'link-hover-color': 'var(--color-primary-dark)',
  'link-font-weight': '500',
  'heading-h1-size': '30px',
  'heading-h2-size': '24px',
  'heading-h3-size': '20px',
  'heading-font-family': 'var(--font-heading)',
  'heading-color': 'var(--color-text)',
  'heading-font-weight': '700',
  'sidebar-width': '260px',
  'sidebar-bg': 'var(--color-surface)',
  'sidebar-item-padding-x': '12px',
  'sidebar-item-padding-y': '10px',
  'sidebar-item-radius': 'var(--radius-md)',
  'sidebar-active-bg': 'var(--color-primary-bg)',
  'sidebar-active-color': 'var(--color-primary)',
  'toast-padding': '16px',
  'toast-radius': 'var(--radius-md)',
  'toast-font-size': '14px',
  'toast-shadow': 'var(--shadow-lg)',
  'tabs-font-size': '14px',
  'tabs-padding-x': '16px',
  'tabs-padding-y': '10px',
  'tabs-active-color': 'var(--color-primary)',
  'tabs-border-color': 'var(--color-border)',
  'pagination-font-size': '14px',
  'pagination-item-size': '36px',
  'pagination-active-bg': 'var(--color-primary)',
  'pagination-active-color': '#FFFFFF',
  'spinner-size': '32px',
  'spinner-color': 'var(--color-primary)',
  'file-button-radius': '9999px',
  'file-button-padding-x': '16px',
  'file-button-padding-y': '8px',
  'navbar-height': '56px',
  'navbar-bg': 'var(--color-surface)',
  'navbar-border-color': 'var(--color-border)',
  'modal-overlay-opacity': '0.5',
};
