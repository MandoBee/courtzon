# CourtZon Payment Architecture

## Overview

The payment system processes payments through Paymob's Intention API (Egypt standard checkout flow). It uses a webhook-first architecture with a scheduled sync worker as a recovery mechanism.

## Components

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend   │────▶│   Backend    │────▶│    Paymob    │
│  (React)    │     │  (Fastify)   │     │  (Gateway)   │
└─────────────┘     └──────┬───────┘     └──────┬───────┘
                           │                    │
                           │  Intention API     │
                           │◀───────────────────│
                           │                    │
                           │  Webhook callback  │
                           │◀───────────────────│
                           │                    │
                     ┌─────┴──────┐      ┌─────┴──────┐
                     │   MySQL    │      │   Redis     │
                     │  (DB)      │      │  (BullMQ)  │
                     └────────────┘      └────────────┘
```

## Directory Structure

```
backend/src/modules/payment/
├── presentation/
│   ├── payment.controller.ts    # HTTP handlers
│   ├── payment.routes.ts        # Route definitions
│   └── payment.dto.ts           # Request validation schemas
├── application/
│   └── payment.service.ts       # Core payment logic
├── domain/
│   └── payment.entity.ts        # Payment entity types
└── infrastructure/
    └── payment.repository.ts    # Database queries

backend/src/shared/services/gateway/
├── gateway-factory.ts           # Gateway selection (paymob vs mock)
├── payment-gateway.types.ts     # Gateway interface
├── paymob-gateway.ts            # Paymob Intention API integration
└── mock-gateway.ts              # Development mock
```

## Key Files

| File | Purpose |
|------|---------|
| `payment.routes.ts` | Defines all payment endpoints |
| `payment.controller.ts` | HTTP request/response handling |
| `payment.service.ts` | Business logic: charge, webhook, sync, expiry |
| `paymob-gateway.ts` | Paymob API integration (Intention, Refund, Status) |
| `gateway-factory.ts` | Creates gateway instance from env config |

## Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/payments/charge` | JWT | Initiate payment |
| `POST` | `/payments/webhook` | None | Paymob callback |
| `POST` | `/payments/:id/refund` | JWT + financial.reconcile | Process refund |
| `GET` | `/payments/transactions` | JWT | List user transactions |
| `POST` | `/payments/sync` | JWT + financial.reconcile | Trigger sync |
| `POST` | `/payments/expire` | JWT + financial.reconcile | Trigger expiry |
| `GET` | `/payments/health` | JWT + financial.reconcile | Health metrics |

## Technology Stack

- **Runtime**: Node.js 22 (Fastify)
- **Database**: MySQL 8 (via mysql2)
- **Queue**: BullMQ on Redis 7
- **Gateway**: Paymob Intention API (Egypt)
- **API Base URL**: `https://accept.paymob.com`
