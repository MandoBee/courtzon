/**
 * Landing page (CMS blocks) styling — Appearance Studio → Landing tab.
 * Content/copy stays in CMS; decoration is controlled here.
 */

import type { ComponentStyleDefinition, ComponentStyleProperty } from './component-styles';

export const LANDING_STYLE_DEFAULTS: Record<string, string> = {
  'landing-hero-padding-y': '96px',
  'landing-hero-title-size': 'clamp(2.25rem, 5vw, 3.75rem)',
  'landing-hero-inner-gap': '24px',
  'landing-section-padding-y': '80px',
  'landing-section-title-size': 'clamp(1.875rem, 3vw, 2.25rem)',
  'landing-section-subtitle-size': '18px',
  'landing-section-header-margin': '64px',
  'landing-card-radius': 'var(--radius-lg)',
  'landing-card-padding': '32px',
  'landing-card-shadow': 'var(--shadow-md)',
  'landing-card-shadow-hover': 'var(--shadow-lg)',
  'landing-card-border-color': 'var(--color-border)',
  'landing-card-border-hover': 'var(--color-primary)',
  'landing-feature-icon-size': '48px',
  'landing-feature-icon-radius': 'var(--radius-md)',
  'landing-grid-gap': '24px',
  'landing-faq-item-radius': 'var(--radius-lg)',
  'landing-pricing-highlight-scale': '1.03',
};

const sectionProps: ComponentStyleProperty[] = [
  { tokenKey: 'landing-section-padding-y', label: 'Section padding (vertical)', control: 'size', min: 40, max: 160 },
  { tokenKey: 'landing-section-title-size', label: 'Section title size', control: 'font-size', min: 20, max: 48 },
  { tokenKey: 'landing-section-subtitle-size', label: 'Section subtitle size', control: 'font-size', min: 14, max: 24 },
  { tokenKey: 'landing-section-header-margin', label: 'Space below section header', control: 'size', min: 24, max: 96 },
  { tokenKey: 'landing-grid-gap', label: 'Grid gap between cards', control: 'size', min: 8, max: 48 },
];

const cardProps: ComponentStyleProperty[] = [
  { tokenKey: 'landing-card-radius', label: 'Card corner radius', control: 'radius', min: 0, max: 32 },
  { tokenKey: 'landing-card-padding', label: 'Card padding', control: 'size', min: 16, max: 48 },
  { tokenKey: 'landing-card-shadow', label: 'Card shadow', control: 'shadow' },
  { tokenKey: 'landing-card-shadow-hover', label: 'Card shadow (hover)', control: 'shadow' },
  { tokenKey: 'landing-card-border-color', label: 'Card border', control: 'color' },
  { tokenKey: 'landing-card-border-hover', label: 'Card border (hover)', control: 'color' },
];

export const LANDING_BLOCK_DEFINITIONS: ComponentStyleDefinition[] = [
  {
    id: 'hero',
    label: 'Hero',
    description: 'Top banner — also edit colors in Landing hero (light & dark) above',
    category: 'landing-hero',
    properties: [
      { tokenKey: 'landing-hero-padding-y', label: 'Vertical padding', control: 'size', min: 48, max: 200 },
      { tokenKey: 'landing-hero-title-size', label: 'Title size', control: 'font-size', min: 24, max: 72 },
      { tokenKey: 'landing-hero-inner-gap', label: 'Gap under title', control: 'size', min: 8, max: 48 },
    ],
  },
  {
    id: 'features',
    label: 'Features grid',
    description: 'Feature cards on home / marketing pages',
    category: 'landing-features',
    properties: [
      ...sectionProps,
      ...cardProps,
      { tokenKey: 'landing-feature-icon-size', label: 'Icon box size', control: 'size', min: 32, max: 72 },
      { tokenKey: 'landing-feature-icon-radius', label: 'Icon box radius', control: 'radius', min: 0, max: 24 },
    ],
  },
  {
    id: 'content',
    label: 'Content sections',
    description: 'Text, team, testimonials, blog, FAQ, contact, pricing',
    category: 'landing-content',
    properties: [...sectionProps, ...cardProps],
  },
  {
    id: 'cta',
    label: 'CTA & stats bands',
    description: 'Gradient bands — colors in Landing hero (light & dark)',
    category: 'landing-cta',
    properties: [
      { tokenKey: 'landing-section-padding-y', label: 'Band padding', control: 'size', min: 40, max: 120 },
      { tokenKey: 'landing-section-title-size', label: 'Title size', control: 'font-size', min: 20, max: 40 },
    ],
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'Accordion items',
    category: 'landing-faq',
    properties: [
      ...sectionProps,
      { tokenKey: 'landing-faq-item-radius', label: 'FAQ item radius', control: 'radius', min: 0, max: 24 },
      { tokenKey: 'landing-card-padding', label: 'FAQ item padding', control: 'size', min: 12, max: 32 },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    description: 'Plan cards',
    category: 'landing-pricing',
    properties: [
      ...sectionProps,
      ...cardProps,
      {
        tokenKey: 'landing-pricing-highlight-scale',
        label: 'Featured plan scale',
        control: 'size',
        min: 1,
        max: 1.1,
        unit: '',
      },
    ],
  },
];

const landingTokenKeys = new Set(
  LANDING_BLOCK_DEFINITIONS.flatMap((b) => b.properties.map((p) => p.tokenKey)),
);

export function isLandingStyleToken(tokenKey: string): boolean {
  return landingTokenKeys.has(tokenKey);
}

export function getLandingDefinition(id: string): ComponentStyleDefinition | undefined {
  return LANDING_BLOCK_DEFINITIONS.find((b) => b.id === id);
}
