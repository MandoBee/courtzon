/** Normalize optional website for API: empty → '', otherwise ensure http(s) scheme. */
export function normalizeOptionalWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
