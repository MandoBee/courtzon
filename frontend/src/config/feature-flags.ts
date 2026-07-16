function envFlag(key: string): boolean {
  return import.meta.env[key] === 'true';
}

export const featureFlags = {
  coaching: {
    slice0: envFlag('VITE_FEATURE_COACHING_SLICE0_ENABLED'),
    slice1: envFlag('VITE_FEATURE_COACHING_SLICE1_ENABLED'),
    slice2: envFlag('VITE_FEATURE_COACHING_SLICE2_ENABLED'),
    slice3: envFlag('VITE_FEATURE_COACHING_SLICE3_ENABLED'),
    slice4: envFlag('VITE_FEATURE_COACHING_SLICE4_ENABLED'),
    slice5: envFlag('VITE_FEATURE_COACHING_SLICE5_ENABLED'),
    slice6: envFlag('VITE_FEATURE_COACHING_SLICE6_ENABLED'),
    slice7: envFlag('VITE_FEATURE_COACHING_SLICE7_ENABLED'),
    slice8: envFlag('VITE_FEATURE_COACHING_SLICE8_ENABLED'),
    slice9: envFlag('VITE_FEATURE_COACHING_SLICE9_ENABLED'),
    slice10: envFlag('VITE_FEATURE_COACHING_SLICE10_ENABLED'),
    booking: envFlag('VITE_FEATURE_COACHING_BOOKING_ENABLED'),
    promoCodes: envFlag('VITE_FEATURE_COACHING_PROMO_CODES_ENABLED'),
    onboarding: envFlag('VITE_FEATURE_COACHING_ONBOARDING_ENABLED'),
    videoIntro: envFlag('VITE_FEATURE_COACHING_VIDEO_INTRO_ENABLED'),
  },
} as const;

export type CoachingFeatureFlag = keyof typeof featureFlags.coaching;
