# Platform Contracts

Base interfaces for all CourtZon platform contracts.

## Convention

Every platform (Notification, Payment, Booking, etc.) exports a contract
interface that extends `PlatformContract` with business methods.

Contracts live at `backend/src/platform/contracts/<platform>/`.

## Rules

1. Contracts contain **only** type definitions — zero implementation.
2. Contracts depend **only** on `PlatformContract` and shared platform types.
3. Every contract must set `contractName` and `version`.
4. Business modules import contracts only — never implementations.
5. Adding a new method to a contract is a minor version bump.
6. Removing or changing a method signature is a major version bump.
