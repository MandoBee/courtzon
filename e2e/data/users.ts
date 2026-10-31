export const testUsers = {
  player: () => ({
    // 3-digit Egyptian mobile prefix + 8 digits = the 11-digit local number
    // required by `localPhoneNumberSchema` (login) and `localPhoneZod` (form).
    phoneNumber: '010' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Player ' + Date.now(),
    email: `e2e-player-${Date.now()}@test.com`,
    gender: 'male' as const,
    timezone: 'UTC',
    countryId: 1,
  }),

  admin: () => ({
    // Phone+password only: CourtZon login does not accept email identifiers.
    phoneNumber: '011' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Admin ' + Date.now(),
    email: `e2e-admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`,
  }),

  coach: () => ({
    phoneNumber: '012' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Coach ' + Date.now(),
    email: `e2e-coach-${Date.now()}@test.com`,
    gender: 'male' as const,
    timezone: 'UTC',
    countryId: 1,
    isCoach: true,
  }),

  seller: () => ({
    phoneNumber: '015' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Seller ' + Date.now(),
    email: `e2e-seller-${Date.now()}@test.com`,
    gender: 'female' as const,
    timezone: 'UTC',
    countryId: 1,
    mainSportId: 1,
  }),

  secondPlayer: () => ({
    phoneNumber: '010' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Player 2 ' + Date.now(),
    email: `e2e-player2-${Date.now()}@test.com`,
    gender: 'female' as const,
    timezone: 'UTC',
    countryId: 1,
  }),
};
