import { test as base } from '@playwright/test';
import { testUsers } from '../data/users';
import { testCourts, organisationPayload, branchPayload } from '../data/courts';
import {
  insertUser,
  insertOrganisation,
  insertBranch,
  insertResource,
  cleanup,
} from '../helpers/database';
import { api, clearCookies } from '../helpers/api';

type OrganisationFixtures = {
  testOrganisation: {
    organisationId: number;
    branchId: number;
    resourceId: number;
    ownerId: number;
  };
};

export const test = base.extend<OrganisationFixtures>({
  testOrganisation: [
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

      await use({
        organisationId,
        branchId,
        resourceId,
        ownerId,
      });

      clearCookies();
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
