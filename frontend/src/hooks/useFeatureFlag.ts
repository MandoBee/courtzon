import { useFeatureFlagsStore } from '../store/feature-flags.store';

export function useFeatureFlag(key: string): boolean {
  return useFeatureFlagsStore(s => s.isEnabled(key));
}
