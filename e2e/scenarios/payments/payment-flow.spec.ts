import { test, expect } from '../../fixtures/auth';
import { PaymentPage } from '../../pages/PaymentPage';
import {
  testCourts,
  organisationPayload,
  branchPayload,
  prepareBookingPayload,
} from '../../data/courts';
import {
  insertOrganisation,
  insertBranch,
  insertResource,
  query,
} from '../../helpers/database';
import { api } from '../../helpers/api';

test.describe('Payment Flow', () => {

  test('complete payment flow for a booking', async ({ authenticatedPlayer }) => {
    const { page, user } = authenticatedPlayer;
    const paymentPage = new PaymentPage(page);

    const loginRes = await api.login(user.phoneNumber, user.password);
    expect(loginRes.status).toBe(200);

    const [rows] = await query<any>(
      'SELECT id FROM users WHERE phone_number = ?',
      [user.phoneNumber],
    );
    const userId = rows[0]?.id;
    expect(userId).toBeDefined();

    const orgId = await insertOrganisation(organisationPayload(userId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resourceId = await insertResource(testCourts.tennisCourt(branchId));

    const booking = prepareBookingPayload(resourceId, branchId);
    const prepareRes = await api.prepareBooking(booking);
    const bookingId = prepareRes.data?.id || prepareRes.data?.data?.id;
    expect(bookingId).toBeDefined();

    await paymentPage.goto(`/bookings/${bookingId}/payment`);
    await paymentPage.selectPaymentMethod('card');

    await paymentPage.enterCardDetails({
      number: '4242424242424242',
      expiry: '12/28',
      cvc: '123',
      name: 'Test Cardholder',
    });

    await paymentPage.submitPayment();
    const result = await paymentPage.waitForPaymentResult();

    expect(result).toBe('success');
  });

});
