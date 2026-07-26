import { test as base } from '@playwright/test';
import { testUsers } from '../data/users';
import { testCourts, organisationPayload, branchPayload, prepareBookingPayload } from '../data/courts';
import {
  insertUser,
  insertOrganisation,
  insertBranch,
  insertResource,
} from '../helpers/database';
import { api, clearCookies } from '../helpers/api';

type PaymentFixtures = {
  paymentMethod: {
    slug: string;
    name: string;
  };
  paidBooking: {
    bookingId: number;
    resourceId: number;
    branchId: number;
    organisationId: number;
    ownerId: number;
  };
};

export const test = base.extend<PaymentFixtures>({
  paymentMethod: [
    async ({}, use) => {
      const method = { slug: 'card', name: 'Card' };
      await use(method);
    },
    { scope: 'test' },
  ],

  paidBooking: [
    async ({}, use) => {
      const owner = testUsers.player();
      const ownerId = await insertUser({
        phoneNumber: owner.phoneNumber,
        password: owner.password,
        fullName: owner.fullName,
        email: owner.email,
        gender: owner.gender,
        timezone: owner.timezone,
        countryId: owner.countryId,
      });

      const orgPayload = organisationPayload(ownerId);
      const organisationId = await insertOrganisation(orgPayload);

      const branch = branchPayload(organisationId);
      const branchId = await insertBranch(branch);

      const court = testCourts.tennisCourt(branchId);
      const resourceId = await insertResource(court);

      await api.login(owner.phoneNumber, owner.password);

      const booking = prepareBookingPayload(resourceId, branchId);
      const res = await api.prepareBooking(booking);
      const bookingId = res.data?.id || res.data?.data?.id;

      const confirmRes = await api.raw('PATCH', `/bookings/${bookingId}/confirm`);
      if (confirmRes.status !== 200) {
        throw new Error(`Failed to confirm booking ${bookingId}: ${confirmRes.status}`);
      }

      await use({
        bookingId,
        resourceId,
        branchId,
        organisationId,
        ownerId,
      });

      clearCookies();
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
