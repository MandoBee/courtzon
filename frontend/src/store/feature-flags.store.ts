import { create } from 'zustand';
import api from '../services/api';

interface FeatureFlagsState {
  flags: Record<string, boolean>;
  loaded: boolean;
  fetch: () => Promise<void>;
  isEnabled: (key: string) => boolean;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>((set, get) => ({
  flags: {},
  loaded: false,
  fetch: async () => {
    try {
      const { data } = await api.get('/public/feature-flags');
      set({ flags: data || {}, loaded: true });
    } catch {
      set({ flags: {}, loaded: true });
    }
  },
  isEnabled: (key: string) => !!get().flags[key],
}));
