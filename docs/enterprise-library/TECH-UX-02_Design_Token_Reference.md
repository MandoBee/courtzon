---
document_id: "TECH-UX-02"
document_name: "Design Token Reference"
family: "TECH-UX"
document_type: "UX"
status: "Draft"
version: "1.0"
audience: ["developer", "designer"]
difficulty: "beginner"
reading_time: 10
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Design Token Reference (TECH-UX-02)

## Color System

All colors are defined as CSS custom properties on `:root` (light) and overridden in `.dark`.

### Base Colors

| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `--color-bg` | `#F9FAFB` | `#111827` | Page background |
| `--color-surface` | `#FFFFFF` | `#1F2937` | Card, modal, sidebar surfaces |
| `--color-text` | `#111827` | `#F9FAFB` | Primary text |
| `--color-text-muted` | `#6B7280` | `#9CA3AF` | Secondary/disabled text |
| `--color-border` | `#E5E7EB` | `#374151` | Borders and dividers |
| `--color-primary` | `#059669` | `#10B981` | Primary actions, links |
| `--color-primary-dark` | `#047857` | `#059669` | Primary hover/active |
| `--color-primary-light` | `#10B981` | `#34D399` | Primary light variant |
| `--color-primary-bg` | `#ECFDF5` | `#064E3B` | Primary background tint |
| `--color-secondary` | `#EA580C` | `#F97316` | Secondary brand color |
| `--color-accent` | `#6366F1` | `#818CF8` | Accent/purple |

### Semantic Colors

| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `--color-success` | `#10B981` | `#34D399` | Success icon/text |
| `--color-success-bg` | `#DCFCE7` | `#064E3B` | Success badge background |
| `--color-success-text` | `#15803D` | `#10B981` | Success badge text |
| `--color-warning` | `#F59E0B` | `#FBBF24` | Warning icon/text |
| `--color-warning-bg` | `#FEF3C7` | `#78350F` | Warning badge background |
| `--color-warning-text` | `#B45309` | `#F59E0B` | Warning badge text |
| `--color-error` | `#EF4444` | `#F87171` | Error icon/text |
| `--color-error-bg` | `#FEE2E2` | `#7F1D1D` | Error badge background |
| `--color-error-text` | `#B91C1C` | `#EF4444` | Error badge text |
| `--color-info-bg` | `#DBEAFE` | `#1E3A5F` | Info badge background |
| `--color-info-text` | `#1D4ED8` | `#60A5FA` | Info badge text |

**Source:** `frontend/src/index.css:5-39`

### Usage Pattern

```css
/* Semantic classes use -bg for backgrounds and -text for text */
.badge-success {
  background-color: var(--color-success-bg);
  color: var(--color-success-text);
}

/* Direct colors for borders, icons */
.border-danger {
  border-color: var(--color-error);
}
```

## Typography

### Font Families

| Token | Value |
|-------|-------|
| `--font-body` | `'Inter', system-ui, -apple-system, sans-serif` |
| `--font-heading` | `'Inter', system-ui, -apple-system, sans-serif` |

**Source:** `index.css:28-29`

### Font Sizes

Tailwind scale is used throughout. Common sizes:

| Tailwind Class | Size | Usage |
|---------------|------|-------|
| `text-[10px]` | 10px | Bottom nav labels, badge text |
| `text-xs` | 12px | Badge font, table cell, small meta |
| `text-sm` | 14px | Body text, form controls, buttons (sm/md) |
| `text-base` | 16px | Button (lg), body emphasis |
| `text-lg` | 18px | Modal header, card title |
| `text-xl` | 20px | Page headings |
| `text-2xl` | 24px | Section headings |

### Font Weights

| Weight | Usage |
|--------|-------|
| `font-medium` (500) | Default for buttons, nav items, labels |
| `font-semibold` (600) | Table headers |
| `font-bold` (700) | Page titles, emphasis |

### Line Heights

| Token | Value |
|-------|-------|
| `--textarea-line-height` | `1.5` |
| Button labels | `leading-tight` |

## Spacing Scale

Tailwind spacing scale is used. Key values:

| Class | Pixels | Usage |
|-------|--------|-------|
| `gap-0.5` | 2px | Icon-to-label gap |
| `gap-1` | 4px | Tight element spacing |
| `gap-2` | 8px | Form control spacing |
| `gap-3` | 12px | Button groups, list items |
| `gap-4` | 16px | Section spacing |
| `p-2` | 8px | Compact padding |
| `p-3` | 12px | Standard padding |
| `p-4` | 16px | Card padding (legacy), sidebar items |
| `px-4` | 16px | Page horizontal padding |
| `py-2.5` | 10px | Button MD padding-y |
| `py-1` | 4px | Badge padding-y |

Custom card padding: `--card-padding: 24px`
Modal padding: `--modal-padding: 24px`

## Border Radius Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Small elements (chips, small buttons) |
| `--radius-md` | `10px` | Buttons, inputs, cards, sidebar items |
| `--radius-lg` | `16px` | Modals, large cards, sections |
| `--radius-xl` | `24px` | Hero sections, large containers |

**Source:** `index.css:30-33`

### Component Border Radius Overrides

| Component | Token | Default |
|-----------|-------|---------|
| Button | `--button-border-radius` | `var(--radius-md)` |
| Card | `--card-border-radius` | `var(--radius-lg)` |
| Modal | `--modal-border-radius` | `var(--radius-lg)` |
| Input | `--form-control-border-radius` | `var(--radius-md)` |
| Select | `--select-border-radius` | `var(--radius-md)` |
| Badge | `--badge-border-radius` | `9999px` (pill) |
| Checkbox | `--checkbox-border-radius` | `4px` |

## Shadow Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | Subtle elevation, skeleton states |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | Cards, dropdowns, standard surfaces |
| `--shadow-lg` | `0 12px 40px rgba(0,0,0,0.08)` | Modals, dialogs, important overlays |
| `--shadow-xl` | `0 20px 60px rgba(0,0,0,0.12)` | Fullscreen overlays, sheet modals |

**Source:** `index.css:34-37`

### Card Shadow

`--card-shadow: var(--shadow-md)` — all `<Card>` components use this by default.

## Component-Specific Tokens

All component tokens are defined in `index.css:41-100+`.

| Token | Default | Description |
|-------|---------|-------------|
| `--button-border-radius` | var(--radius-md) | Button corner rounding |
| `--button-font-weight` | 500 | Button label weight |
| `--button-sm-font-size` | 14px | Small button font |
| `--button-md-font-size` | 14px | Medium button font |
| `--button-lg-font-size` | 16px | Large button font |
| `--form-control-height` | 42px | Input/select height |
| `--form-control-padding-x` | 16px | Input horizontal padding |
| `--form-control-font-size` | 14px | Input font size |
| `--form-control-bg` | var(--color-surface) | Input background |
| `--form-control-border-color` | var(--color-border) | Input border |
| `--form-control-border-radius` | var(--radius-md) | Input corner rounding |
| `--form-control-focus-ring-color` | var(--color-primary) | Input focus ring |
| `--label-font-size` | 14px | Label font size |
| `--label-font-color` | var(--color-text) | Label color |
| `--label-font-weight` | 500 | Label weight |
| `--card-padding` | 24px | Card content padding |
| `--card-border-radius` | var(--radius-lg) | Card corner rounding |
| `--card-shadow` | var(--shadow-md) | Card box shadow |
| `--modal-border-radius` | var(--radius-lg) | Modal corner rounding |
| `--modal-padding` | 24px | Modal content padding |
| `--modal-overlay-opacity` | 0.5 | Backdrop opacity |
| `--badge-font-size` | 12px | Badge text size |
| `--badge-padding-x` | 10px | Badge horizontal padding |
| `--badge-padding-y` | 2px | Badge vertical padding |
| `--badge-border-radius` | 9999px | Badge shape (pill) |
| `--table-cell-padding-x` | 12px | Table cell horizontal padding |
| `--table-cell-padding-y` | 10px | Table cell vertical padding |
| `--table-font-size` | 14px | Table cell font |
| `--table-header-font-weight` | 600 | Header weight |
| `--table-row-hover-bg` | var(--color-primary-bg) | Row hover tint |
| `--checkbox-size` | 16px | Checkbox dimension |
| `--checkbox-border-radius` | 4px | Checkbox corner |
| `--checkbox-accent-color` | var(--color-primary) | Checkbox check color |

## Gradient Tokens

| Token | Value |
|-------|-------|
| `--gradient-primary` | `linear-gradient(135deg, #059669, #10B981)` |
| `--gradient-hero` | `linear-gradient(135deg, #064E3B 0%, #047857 50%, #059669 100%)` |

**Source:** `index.css:38-39`

## Safe Area Tokens

| Class | CSS | Purpose |
|-------|-----|---------|
| `cz-pb-safe` | `padding-bottom: env(safe-area-inset-bottom)` | iOS home indicator clearance |
| `cz-px-safe` | `padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right)` | iOS side safe areas |
| `cz-scrollbar-hide` | `scrollbar-width: none; -ms-overflow-style: none; &::-webkit-scrollbar { display: none; }` | Hide scrollbar on scrollable containers |

## Source

All design tokens: `frontend/src/index.css`
Theme store: `frontend/src/store/theme.store.ts`
Appearance store: `frontend/src/store/appearance.store.ts`
