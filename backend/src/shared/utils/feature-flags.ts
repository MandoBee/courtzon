const features = new Map<string, boolean>();

export function isFeatureEnabled(flag: string): boolean {
  if (features.has(flag)) return features.get(flag)!;
  return process.env[flag] === 'true';
}

export function setFeatureFlag(flag: string, enabled: boolean): void {
  features.set(flag, enabled);
}

export function resetFeatureFlags(): void {
  features.clear();
}
