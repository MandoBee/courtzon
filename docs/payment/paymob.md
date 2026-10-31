# Paymob Integration

## Provider

- **Provider**: Paymob (Egypt)
- **API Base**: `https://accept.paymob.com`
- **Sandbox/Live**: Same URL — controlled by API key type (test vs live keys)
- **Payment Flow**: Intention API → Unified Checkout redirect

## Credentials

| Variable | Purpose | Current Mode |
|----------|---------|-------------|
| `PAYMOB_SECRET` | Intention API secret key | Sandbox (`egy_sk_test_...`) |
| `PAYMOB_API_KEY` | Accept API / refund auth token | Sandbox |
| `PAYMOB_PUBLIC_KEY` | Unified Checkout public key | Sandbox (`egy_pk_test_...`) |
| `VITE_PAYMOB_PUBLIC_KEY` | Frontend build-time public key | Same as PUBLIC_KEY |
| `PAYMOB_HMAC_SECRET` | Webhook HMAC verification | **Not committed.** Obtain the Test/Live HMAC secret securely from the Paymob dashboard or the deployment secret store and inject it via the environment; never commit it. |
| `PAYMOB_MERCHANT_ID` | Integration ID | `5663993` |

### Before LIVE Launch

1. Replace ALL sandbox credentials with live keys from Paymob Dashboard
2. Set `PAYMOB_SANDBOX=false`
3. Verify HMAC secret matches live dashboard
4. Rebuild and deploy Docker images

## Intention API Flow

```
POST https://accept.paymob.com/v1/intention/
Authorization: Token {PAYMOB_SECRET}
Content-Type: application/json

{
  "amount": 100,              // cents (EGP)
  "currency": "EGP",
  "payment_methods": [5663993],
  "billing_data": { ... },
  "customer": { ... },
  "special_reference": "order_123_1234567890",
  "notification_url": "https://api.courtzon.cloud/payments/webhook",
  "redirection_url": "https://courtzon.cloud/payment-result"
}
```

Response:
```json
{
  "id": "pi_test_...",
  "client_secret": "egy_csk_test_...",
  "intention_order_id": "558463721"
}
```

## Webhook Verification

Source of truth for this section: `backend/src/shared/services/gateway/paymob-gateway.ts`
(`verifyWebhook`, lines 354–440) and `backend/src/shared/services/gateway/__tests__/paymob-webhook-hmac.spec.ts`.

The digest is **not** computed over the raw request body and **not** over `JSON.stringify(obj)`. It is computed
over **ordered field values** concatenated with **no separators and no keys**, then HMAC-SHA512 with
`PAYMOB_HMAC_SECRET`, encoded as lowercase hex.

### Intention API Webhook (Primary)

- Selected when the payload contains an `obj` object.
- HMAC is sent as the query parameter `?hmac=<signature>`.
- Field order (20 values, exactly as implemented):
  1. `obj.amount_cents` 2. `obj.created_at` 3. `obj.currency` 4. `obj.error_occured`
  5. `obj.has_parent_transaction` 6. `obj.id` 7. `obj.integration_id` 8. `obj.is_3d_secure`
  9. `obj.is_auth` 10. `obj.is_capture` 11. `obj.is_refunded` 12. `obj.is_standalone_payment`
  13. `obj.is_voided` 14. `obj.order.id` 15. `obj.owner` 16. `obj.pending`
  17. `obj.source_data.pan` 18. `obj.source_data.sub_type` 19. `obj.source_data.type` 20. `obj.success`
- `null`/`undefined` values (including a missing `order` or `source_data` object) are serialized as an empty
  string.
- The computed digest is compared with the supplied signature using exact string equality. A missing or empty
  `PAYMOB_HMAC_SECRET` fails closed (the webhook is rejected), and a non-string signature is normalized to an
  empty string rather than throwing.
- Priority: the query parameter `hmac` is checked BEFORE the `x-paymob-signature` header.

### Accept API Webhook (Legacy)

- Selected when the payload has no `obj` (flat payload).
- HMAC is sent as the header `x-paymob-signature` (the controller also accepts `x-fawry-signature` as a
  fallback).
- Field order (23 values, exactly as implemented):
  1. `amount_cents` 2. `created_at` 3. `currency` 4. `error_occured`
  5. `has_parent_transaction` 6. `id` 7. `integration_id` 8. `is_3d_secure`
  9. `is_auth` 10. `is_capture` 11. `is_refunded` 12. `is_standalone_payment`
  13. `is_voided` 14. `order.id` 15. `order.created_at` 16. `order.merchant_order_id`
  17. `owner` 18. `pending` 19. `refunded_amount_cents` 20. `source_data.pan`
  21. `source_data.sub_type` 22. `source_data.type` 23. `success`
- Only used for legacy Accept API transactions.

> Uncertainty note: the orders above are verified against the **current implementation and its unit tests**, not
> against Paymob's published documentation, which is not available offline. If Paymob's documented order differs,
> treat it as a provider-contract mismatch to be resolved deliberately (tracked as **B7 / P5-05**) — never change
> one side silently.

## Sandbox Test Cards

| Result | Card Number | Expiry | CVV |
|--------|-------------|--------|-----|
| Success | 4987654321098769 | 12/28 | 123 |
| Failure | 4111111111111111 | 12/28 | 123 |

## Payment URL

```
https://accept.paymob.com/unifiedcheckout/?publicKey={PUBLIC_KEY}&clientSecret={CLIENT_SECRET}
```
