export const testCourts = {
  tennisCourt: (branchId: number) => ({
    branchId,
    name: 'E2E Tennis Court ' + Date.now(),
    resourceTypeId: 1,
    sportId: 1,
    capacity: 4,
    isActive: true,
    pricePerHour: 50,
    currencyId: 1,
  }),

  padelCourt: (branchId: number) => ({
    branchId,
    name: 'E2E Padel Court ' + Date.now(),
    resourceTypeId: 1,
    sportId: 2,
    capacity: 4,
    isActive: true,
    pricePerHour: 60,
    currencyId: 1,
  }),

  squashCourt: (branchId: number) => ({
    branchId,
    name: 'E2E Squash Court ' + Date.now(),
    resourceTypeId: 1,
    sportId: 3,
    capacity: 2,
    isActive: true,
    pricePerHour: 40,
    currencyId: 1,
  }),

  footballPitch: (branchId: number) => ({
    branchId,
    name: 'E2E Football Pitch ' + Date.now(),
    resourceTypeId: 2,
    sportId: 4,
    capacity: 10,
    isActive: true,
    pricePerHour: 100,
    currencyId: 1,
  }),

  badmintonCourt: (branchId: number) => ({
    branchId,
    name: 'E2E Badminton Court ' + Date.now(),
    resourceTypeId: 1,
    sportId: 5,
    capacity: 2,
    isActive: true,
    pricePerHour: 30,
    currencyId: 1,
  }),

  basketballCourt: (branchId: number) => ({
    branchId,
    name: 'E2E Basketball Court ' + Date.now(),
    resourceTypeId: 1,
    sportId: 6,
    capacity: 10,
    isActive: true,
    pricePerHour: 80,
    currencyId: 1,
  }),
};

export function branchPayload(organisationId: number) {
  return {
    organisationId,
    name: 'E2E Branch ' + Date.now(),
    cityId: 1,
    countryId: 1,
    timezone: 'UTC',
    lat: 30.0444,
    lng: 31.2357,
    isActive: true,
  };
}

export function organisationPayload(ownerId: number) {
  return {
    ownerId,
    name: 'E2E Organisation ' + Date.now(),
    orgTypeId: 1,
    email: null,
    phone: null,
    website: '',
    isVerified: true,
    isActive: true,
    countryId: 1,
    cityId: 1,
  };
}

export function bookingPayload(resourceId: number, branchId: number) {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  const bookingDate = date.toISOString().slice(0, 10);
  return {
    branchId,
    resourceId,
    bookingType: 'private_match' as const,
    bookingDate,
    startTime: '10:00',
    endTime: '11:00',
    paymentMethod: 'wallet' as const,
  };
}

export function prepareBookingPayload(resourceId: number, branchId: number) {
  const date = new Date();
  date.setDate(date.getDate() + 5);
  const bookingDate = date.toISOString().slice(0, 10);
  return {
    branchId,
    resourceId,
    bookingType: 'private_match' as const,
    bookingDate,
    startTime: '14:00',
    endTime: '15:00',
    paymentMethod: 'card' as const,
    returnUrl: 'http://localhost:5173/bookings',
  };
}
