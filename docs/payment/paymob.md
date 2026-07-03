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
| `PAYMOB_HMAC_SECRET` | Webhook HMAC verification | `97AC2B0EB1E0B5A557AFC05ABE201CAF` |
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

### Intention API Webhook (Primary)

- HMAC sent as query parameter: `?hmac=<signature>`
- Computation: `HMAC-SHA512(JSON.stringify(obj), HMAC_SECRET)`
- Priority: Query param `hmac` is checked BEFORE `x-paymob-signature` header

### Accept API Webhook (Legacy)

- HMAC sent as header: `x-paymob-signature`
- Computation: Concatenation of specific field values
- Only used for legacy Accept API transactions

## Sandbox Test Cards

| Result | Card Number | Expiry | CVV |
|--------|-------------|--------|-----|
| Success | 4987654321098769 | 12/28 | 123 |
| Failure | 4111111111111111 | 12/28 | 123 |

## Payment URL

```
https://accept.paymob.com/unifiedcheckout/?publicKey={PUBLIC_KEY}&clientSecret={CLIENT_SECRET}
```
