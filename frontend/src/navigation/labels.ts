import type { NavLabel, LabelPart } from './types';

export const T = (key: string): NavLabel => ({ kind: 't', key });
export const LIT = (text: string): NavLabel => ({ kind: 'lit', text });
export const COMPOSITE = (parts: LabelPart[]): NavLabel => ({ kind: 'composite', parts });

export function resolveLabel(label: NavLabel, t: (key: string) => string): string {
  switch (label.kind) {
    case 't':
      return t(label.key);
    case 'lit':
      return label.text;
    case 'composite':
      return label.parts.map((p) => (p.kind === 't' ? t(p.key) : p.text)).join('');
  }
}
