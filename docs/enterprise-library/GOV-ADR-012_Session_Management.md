---
document_id: "GOV-ADR-012"
document_name: "Session Management — HttpOnly Cookies with Bearer Token Fallback"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 6
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-001"]
knowledge_objects:
  references: ["TECH-ARCH-07", "TECH-MOD-01"]
  related: ["GOV-ADR-001"]
---

# ADR-012: Session Management — HttpOnly Cookies with Bearer Token Fallback

## Status

Accepted

## Context

The platform must support authentication across web (browser) and mobile (app/webview) clients. Security requirements include protection against XSS token theft while also enabling programmatic API access. Common approaches include:

1. **JWT-only stored in localStorage** — simple but vulnerable to XSS; tokens can be stolen via injected scripts
2. **HttpOnly session cookies** — secure against XSS, but mobile clients need a way to extract and send tokens
3. **OAuth2 with authorization code + PKCE** — industry standard but adds complexity; over-engineered for the current stage
4. **Dual approach: HttpOnly cookies for browser, Bearer tokens for mobile** — flexible but requires two auth mechanisms

## Decision

**Use HttpOnly session cookies as the primary mechanism with Bearer token fallback for mobile/API clients.** The backend sets a session cookie on successful login; mobile clients receive a Bearer token in the JSON response body.

### Session Architecture

```
Login → createSession()
  ├─ Generates sessionToken (for cookie) and refreshToken (for rotation)
  ├─ Creates session record in `sessions` table
  ├─ Sets HttpOnly cookie: `session_token=<token>; HttpOnly; Secure; SameSite=Lax`
  └─ Returns JSON with `session: { sessionToken, refreshToken }` for mobile clients
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Session creation | `createSession()` — generates token pair, stores hashed tokens in DB | `auth.service.ts:514-567` |
| Cookie settings | HttpOnly, Secure, SameSite=Lax (set by cookie parser config in Fastify) | `auth.controller.ts` |
| Token format | Opaque random tokens (not JWT) — `generateSessionToken()` uses 32-byte random | `shared/utils/token.ts` |
| Token hashing | `hashToken()` — SHA-256 hash stored in DB; plaintext never persisted | `shared/utils/token.ts` |
| Session resolution | `resolveSessionUserId()` — reads cookie first, falls back to `Authorization: Bearer` header | `auth.middleware.ts:89-91` |
| Refresh token | Separate refresh token with configurable expiry (30d with remember-me, 24h without) | `auth.service.ts:530-535` |
| Device tracking | Optional `deviceId` via fingerprint for multi-device management | `auth.service.ts:520-527` |
| Session limits | `SESSION_MAX_DEVICES=5` — oldest session revoked when exceeded | `auth.service.ts:548-553` |
| Mobile session token | Extracted from JSON response body, stored in app secure storage | `auth.service.ts:561` |

### Resolve Order

```
resolveSessionUserId(request)
  1. Try `session_token` cookie
  2. Fall back to `Authorization: Bearer <token>` header
  3. Hash the token, look up in `sessions` table
  4. Check expiry — if expired, return null (not error)
  5. Return userId or null
```

**Evidence:** `auth.middleware.ts:89-91` — the dual resolution logic.

### Mobile Support

- Mobile apps receive `sessionToken` and `refreshToken` in the login response body
- The `refreshToken` enables silent token refresh via `POST /auth/refresh`
- No dependency on cookie storage on mobile — Bearer header is used exclusively

### Why Not OAuth2

OAuth2 with authorization code + PKCE would be more standard but introduces:
- Authorization server complexity
- Redirect URI management
- State/verifier parameter management on mobile
- No immediate multi-service architecture that would benefit from OAuth2 scopes

The dual cookie/Bearer approach is simpler and sufficient for the current monolith-with-modules architecture.

## Consequences

### Positive

- **XSS protection**: HttpOnly cookies cannot be read by JavaScript in browser context
- **Mobile-friendly**: Bearer token fallback supports all non-browser clients
- **Token opaque**: No JWT payload means no sensitive data exposure in tokens
- **Session revocation**: Server-side sessions can be individually revoked
- **Refresh token rotation**: Each refresh invalidates the previous refresh token (rotation)
- **Device limit enforcement**: Automatic oldest-session eviction prevents token hoarding

### Negative

- **Two auth mechanisms**: Slightly more complex middleware logic than a single approach
- **No JWT claims**: Each request requires a DB lookup against the sessions table to resolve user
- **CSRF exposure**: HttpOnly cookies are still vulnerable to CSRF (mitigated by SameSite=Lax and non-GET state-changing endpoints)
- **Token hash overhead**: Every authenticated request hashes the token before DB lookup

## Evidence

- `auth.service.ts:514-567` — `createSession()` generates tokens, stores hash, sets session
- `auth.service.ts:320-348` — `login()` calls `createSession()` after credential verification
- `auth.middleware.ts:89-91` — `resolveSessionUserId()` dual resolution (cookie then Bearer)
- `shared/utils/token.ts` — `generateSessionToken()`, `generateRefreshToken()`, `hashToken()`
- `infrastructure/repositories/session.repository.ts` — session CRUD and revocation

## Related Decisions

- GOV-ADR-001 (Global Identity Model): The `users` table underpins the session system
