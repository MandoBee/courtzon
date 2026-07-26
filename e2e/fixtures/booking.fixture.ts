import { test as base } from '@playwright/test';
import { testUsers } from '../data/users';
import { testCourts, organisationPayload, branchPayload, bookingPayload } from '../data/courts';
import { insertUser, insertOrganisation, insertBranch, insertResource, cleanup } from '../helpers/database';
import { api, clearCookies } from '../helpers/api';

type BookingFixtures = {
  draftBooking: {
    bookingId: number;
    resourceId: number;
    branchId: number;
    organisationId: number;
    ownerId: number;
  };
  confirmedBooking: {
    bookingId: number;
    resourceId: number;
    branchId: number;
    organisationId: number;
    ownerId: number;
  };
};

export const test = base.extend<BookingFixtures>({
  draftBooking: [
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

      const booking = bookingPayload(resourceId, branchId);
      const res = await api.createBooking(booking);
      const bookingId = res.data?.id || res.data?.data?.id;

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

  confirmedBooking: [
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

      const booking = bookingPayload(resourceId, branchId);
      const res = await api.createBooking(booking);
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
