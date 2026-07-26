export const testUsers = {
  player: () => ({
    phoneNumber: '01000000' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Player ' + Date.now(),
    email: `e2e-player-${Date.now()}@test.com`,
    gender: 'male' as const,
    timezone: 'UTC',
    countryId: 1,
  }),

  admin: () => ({
    email: 'admin@courtzon.cloud',
    password: process.env.ADMIN_PASSWORD || 'admin123456',
  }),

  coach: () => ({
    phoneNumber: '01000001' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Coach ' + Date.now(),
    email: `e2e-coach-${Date.now()}@test.com`,
    gender: 'male' as const,
    timezone: 'UTC',
    countryId: 1,
    isCoach: true,
  }),

  seller: () => ({
    phoneNumber: '01000002' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Seller ' + Date.now(),
    email: `e2e-seller-${Date.now()}@test.com`,
    gender: 'female' as const,
    timezone: 'UTC',
    countryId: 1,
    mainSportId: 1,
  }),

  secondPlayer: () => ({
    phoneNumber: '01000003' + Math.random().toString().slice(2, 10).padEnd(8, '9'),
    password: 'test123456',
    fullName: 'E2E Player 2 ' + Date.now(),
    email: `e2e-player2-${Date.now()}@test.com`,
    gender: 'female' as const,
    timezone: 'UTC',
    countryId: 1,
  }),
};
