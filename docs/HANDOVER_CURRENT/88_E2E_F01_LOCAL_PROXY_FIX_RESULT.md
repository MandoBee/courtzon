# 88_E2E_F01_LOCAL_PROXY_FIX_RESULT.md

**Date:** 2026-10-06
**Type:** Infrastructure/config correctness fix (local Docker E2E blocker F-01)
**Scope:** Strictly F-01. F-02 and all other E2E findings intentionally not touched.
**Overall verdict:** PASS

---

## 1. Starting HEAD

- `8eef5f6f` (`docs: add p0 safe e2e results`)
- Working tree at start: clean; origin/master aligned.

## 2. Root cause (confirmed)

Runtime (Stage 2) and source confirmed the chain:

1. The frontend nginx (`frontend/api-proxy.conf`) maps bare API prefixes (`/tournaments`, `/referee`,
   `/bookings`, `/public`, …) directly to the backend and unconditionally sets
   `X-Forwarded-Proto` to the local listener scheme.
2. `frontend/nginx.conf` computed that value from `map $http_x_forwarded_proto $forwarded_proto`
   with `default $scheme;` → on local HTTP access (`http://localhost:5173`) that produced
   `X-Forwarded-Proto: http`.
3. `backend/src/app.ts` (lines 184–191) — with `NODE_ENV=production` and the compose default
   `RELAX_RATE_LIMIT=false` — runs an `onRequest` hook that redirects any request where
   `X-Forwarded-Proto` is present and **not** `https` to `https://${hostname}${url}`.
   `fastify` hostname strips the port → `https://localhost/...`, which is unreachable locally.
4. Result (reproduced): `GET /tournaments`, `/referee/assignments`, `/bookings`,
   `/public/tournaments` → `302 https://localhost/...` → connection failed.

This only affected the **local HTTP Docker** path. In production, the real reverse proxy
(Coolify/Cloudflare) sets `X-Forwarded-Proto: https`, so the guard never fired.

## 3. Files changed

| File | Change |
|---|---|
| `frontend/nginx.conf` | `map $http_x_forwarded_proto $forwarded_proto` default changed from `$scheme` to `""` (emit no `X-Forwarded-Proto` when no upstream scheme is declared) |

No backend code, no database, no migrations, no tournament logic, no RBAC, no API contracts changed.

## 4. Exact fix

```nginx
map $http_x_forwarded_proto $forwarded_proto {
        default "";
        "https" "https";
        "http" "http";
    }
```

- When the upstream (production proxy) sends `X-Forwarded-Proto: https` → nginx forwards `https`.
- When an upstream declares `http` → nginx still forwards `http`, so the backend HTTPS guard keeps
  redirecting insecure public-side traffic (security preserved).
- When **no** upstream scheme is declared (local HTTP Docker) → nginx emits **no**
  `X-Forwarded-Proto` header, so the backend guard's `proto !== 'https'` check never fires; the
  request is handled normally over internal HTTP.
- `proxy_set_header X-Forwarded-Proto $forwarded_proto;` with an empty value causes nginx to drop the
  header (standard nginx behavior).

## 5. Why production HTTPS enforcement remains protected

- The backend HTTPS guard in `app.ts` is **unchanged** and remains active
  (`NODE_ENV=production`, `RELAX_RATE_LIMIT=false` untouched).
- The guard still redirects whenever an explicit `X-Forwarded-Proto` is not `https`. Production
  proxies always declare `https`; a misconfigured `http` declaration is still redirected.
- The only behavioral change is for requests with **no** upstream scheme claim — the local HTTP
  container path — which now correctly stays internal HTTP instead of being redirected to a
  non-existent `https://localhost`.
- `RELAX_RATE_LIMIT`/rate-limit/cookie/CORS production settings were **not** changed; auth security
  untouched.

## 6. Before / after HTTP behavior

| Request | Before | After |
|---|---|---|
| `GET http://localhost:5173/tournaments` (no auth) | `302 https://localhost/tournaments` (dead) | `401 AUTHENTICATION_ERROR` (normal) |
| `GET http://localhost:5173/referee/assignments` (no auth) | `302 https://localhost/referee/assignments` | `401 AUTHENTICATION_ERROR` |
| `GET http://localhost:5173/bookings` (no auth) | `302 https://localhost/bookings` | `401 AUTHENTICATION_ERROR` |
| `GET http://localhost:5173/public/tournaments` (public) | `302 https://localhost/public/tournaments` | `200` public JSON list |
| `GET /api/...`, `/auth/...` same-origin proxies | 302 risk | normal backend responses |
| Production HTTPS behind Coolify/Cloudflare | `https` asserted (no redirect) | **unchanged** (`https` still asserted) |

## 7. Validation commands / results

- Frontend tournament test suite: **195 passed / 0 failed** (23 files).
- `npx tsc --noEmit`: **clean (exit 0)** — no TypeScript changed.
- `npm run build`: **PASS**.
- `docker compose build frontend` → rebuilt (nginx.conf baked into the image); `nginx -t` → **syntax ok / test successful**.
- `docker compose up -d` → containers healthy.
- F-01 repro probes (after fix):
  - `GET /tournaments` → **401** (was 302 https://localhost)
  - `GET /referee/assignments` → **401** (was 302)
  - `GET /bookings` → **401** (was 302)
  - `GET /public/tournaments` (json) → **200** public list (was 302)
  - `GET /` → 200 SPA shell; `GET /health` → 200 ok; `GET /health/ready` → 200 ok

## 8. Docker status

- `courtzon-frontend`: rebuilt, `Up (healthy)` (30s at validation time), 0.0.0.0:5173->80.
- `courtzon-backend`: `Up (healthy)` (unchanged).
- `courtzon-mysql` / `courtzon-redis`: `Up (healthy)`.
- Guard-preservation re-check (direct backend): `X-Forwarded-Proto:http` → **302** (still enforced), `X-Forwarded-Proto:https` → **401** (normal), no XFP → **401** (normal). Production HTTPS enforcement is intact.

## 9. Tests / build / typecheck

- Tournament suite: 195 passed / 0 failed.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0.

## 10. Commits

- Feature: `f0d9c02f` — `fix(e2e): fix local docker api proxy https redirect`
- Docs: the `docs: add local proxy fix result` commit (the one that adds this file)

## 11. Final Git status

- Working tree: clean.
- `HEAD == origin/master` after both commits are pushed to `master`.

## 12. Confirmation — no DB/data modified

Only read-only GET/health requests will be issued to validate the fix. No registrations, results,
bookings, payments, accounting, or tournament-state mutations. Tournament 4 / Tournament 5 untouched
(and absent from the running `courtzon_v3` DB anyway).