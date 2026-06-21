/** Normalize optional website input: empty → '', otherwise ensure http(s) scheme. */
export function normalizeOptionalWebsiteUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
